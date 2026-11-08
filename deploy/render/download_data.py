"""Private S3-compatible startup download; stdlib only, bounded memory, no URLs in logs.

Progress and failures are logged with artifact numbers, sizes, rates and fixed codes only.
One deadline (CHARGE_GAP_DOWNLOAD_DEADLINE_S) covers every artifact, attempt and retry wait.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
import time
from urllib.parse import quote, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener
from urllib.error import HTTPError, URLError


class ConfigurationError(ValueError):
    def __init__(self, message, code='MANIFEST_INVALID'):
        super().__init__(message)
        self.code=code


class DownloadError(RuntimeError):
    def __init__(self, message, code='DOWNLOAD_FAILED', http_status=None, provider_code=None, artifact_index=None,
                 received_bytes=None, expected_bytes=None, elapsed_s=None):
        super().__init__(message)
        self.code=code
        self.http_status=http_status
        self.provider_code=provider_code
        self.artifact_index=artifact_index
        # Numbers only: how far the failing artifact got and how long the bootstrap ran.
        self.received_bytes=received_bytes
        self.expected_bytes=expected_bytes
        self.elapsed_s=elapsed_s


MIB = 1024*1024
CHUNK = MIB
ATTEMPTS = 3


class DownloadLimits:
    """Startup download limits. All values are non-secret integers; defaults favour slow but healthy links.

    deadline_s        whole bootstrap (all artifacts, all attempts and retry waits); never extended by retries
    stall_s           observation window for the stall check
    stall_min_bytes   fewer bytes than this inside one stall window means the transfer is stalled
    socket_timeout_s  one blocking connect/read; capped by the time left before the deadline
    """
    ENV = {'deadline_s':('CHARGE_GAP_DOWNLOAD_DEADLINE_S',900,60,3600),
           'stall_s':('CHARGE_GAP_DOWNLOAD_STALL_S',60,10,900),
           'stall_min_bytes':('CHARGE_GAP_DOWNLOAD_STALL_MIN_BYTES',64*1024,1,64*MIB),
           'socket_timeout_s':('CHARGE_GAP_DOWNLOAD_SOCKET_TIMEOUT_S',30,5,300)}

    def __init__(self, deadline_s=900, stall_s=60, stall_min_bytes=64*1024, socket_timeout_s=30,
                 progress_bytes=16*MIB, progress_s=15):
        self.deadline_s=deadline_s
        self.stall_s=stall_s
        self.stall_min_bytes=stall_min_bytes
        self.socket_timeout_s=socket_timeout_s
        self.progress_bytes=progress_bytes
        self.progress_s=progress_s

    @classmethod
    def from_env(cls, env):
        values={}
        for field,(name,default,low,high) in cls.ENV.items():
            raw=env.get(name,'')
            if raw is None or not str(raw).strip():
                values[field]=default
                continue
            text=str(raw).strip()
            if not re.fullmatch(r'[0-9]{1,9}',text) or not low <= int(text) <= high:
                raise ConfigurationError('Invalid download limit',code='DOWNLOAD_LIMITS_INVALID')
            values[field]=int(text)
        if values['stall_s'] >= values['deadline_s']:
            raise ConfigurationError('Invalid download limit',code='DOWNLOAD_LIMITS_INVALID')
        return cls(**values)

    def describe(self):
        return (f'deadline {self.deadline_s}s, stall < {self.stall_min_bytes} bytes per {self.stall_s}s, '
                f'socket timeout {self.socket_timeout_s}s')


S3_ERROR_CODES = frozenset({'AccessDenied','InvalidAccessKeyId','SignatureDoesNotMatch',
    'ExpiredToken','InvalidToken','NoSuchBucket','NoSuchKey','RequestTimeTooSkewed',
    'RequestExpired','AuthorizationHeaderMalformed','SlowDown','InternalError',
    'ServiceUnavailable'})


def s3_error_code(exc):
    """Inspect at most 4 KiB; expose only known provider error identifiers."""
    if not isinstance(exc,HTTPError):
        return None
    try:
        body=exc.read(4096)
        match=re.search(rb'<Code>\s*([A-Za-z0-9]+)\s*</Code>',body)
        code=match.group(1).decode('ascii') if match else None
        return code if code in S3_ERROR_CODES else None
    except Exception:
        return None  # Never print response bodies, parser errors or unknown identifiers.


CONFIG_DIAGNOSTICS = {
    'MANIFEST_INVALID': 'Check the bundled data-manifest.json',
    'S3_ENDPOINT_INVALID': 'Check CHARGE_GAP_S3_ENDPOINT: HTTPS origin only, no bucket path, query or credentials',
    'S3_BUCKET_INVALID': 'Check CHARGE_GAP_S3_BUCKET',
    'S3_PREFIX_INVALID': 'Check CHARGE_GAP_S3_PREFIX; root objects require an empty prefix',
    'S3_REGION_INVALID': 'Check CHARGE_GAP_S3_REGION; Cloudflare R2 uses auto',
    'S3_CREDENTIALS_MISSING': 'Set CHARGE_GAP_S3_ACCESS_KEY_ID and CHARGE_GAP_S3_SECRET_ACCESS_KEY',
    'DOWNLOAD_LIMITS_INVALID': ('Check CHARGE_GAP_DOWNLOAD_DEADLINE_S (60-3600), CHARGE_GAP_DOWNLOAD_STALL_S (10-900, '
        'below the deadline), CHARGE_GAP_DOWNLOAD_STALL_MIN_BYTES (1-67108864) and '
        'CHARGE_GAP_DOWNLOAD_SOCKET_TIMEOUT_S (5-300); whole numbers only'),
}

# Codes raised by sync_data itself; the deadline is final, the others are retried.
OWN_FAILURES = frozenset({'ARTIFACT_TOO_LARGE','ARTIFACT_VERIFICATION_FAILED','DOWNLOAD_STALLED',
    'DOWNLOAD_DEADLINE_EXCEEDED'})
FAILURE_CODES = frozenset({'S3_HTTP_ERROR','DOWNLOAD_TIMEOUT','S3_NETWORK_ERROR','DOWNLOAD_IO_ERROR',
    'DOWNLOAD_FAILED','MEMORY_ALLOCATION_FAILED'}) | OWN_FAILURES


def download_failure(exc):
    """Return fixed categories and numeric status, never provider text or URLs."""
    if isinstance(exc,HTTPError):
        status=exc.code if type(exc.code) is int and 100 <= exc.code <= 599 else None
        exc.close()
        return 'S3_HTTP_ERROR',status
    if isinstance(exc,TimeoutError):
        return 'DOWNLOAD_TIMEOUT',None
    if isinstance(exc,MemoryError):
        return 'MEMORY_ALLOCATION_FAILED',None
    if isinstance(exc,URLError):
        return ('DOWNLOAD_TIMEOUT' if isinstance(exc.reason,TimeoutError) else 'S3_NETWORK_ERROR'),None
    if isinstance(exc,DownloadError) and exc.code in OWN_FAILURES:
        return exc.code,None
    if isinstance(exc,OSError):
        return 'DOWNLOAD_IO_ERROR',None
    return 'DOWNLOAD_FAILED',None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward credentials to a redirect target.


def load_manifest(path):
    items = json.loads(Path(path).read_text(encoding='utf-8'))['files']
    required = {'data/processed/charger_info_clean.csv',
                'data/processed/ev_registration_by_region_2026_09.csv',
                'data/processed/charger_installation_trend.csv', 'reports/chart_verification.json'}
    seen = set()
    for item in items:
        name = item['path']
        if name in seen or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts:
            raise ConfigurationError('Invalid manifest path')
        if name not in required and not re.fullmatch(r'outputs/charts/(0[1-9]|10)_[a-z0-9_]+\.png', name):
            raise ConfigurationError('Unexpected artifact')
        if not isinstance(item['bytes'],int) or not 0 < item['bytes'] <= 300*1024**2:
            raise ConfigurationError('Invalid artifact size')
        if not re.fullmatch('[0-9a-f]{64}',item['sha256']):
            raise ConfigurationError('Invalid artifact digest')
        seen.add(name)
    if not required <= seen or len(items) != 14 or len({p.split('/')[-1][:2] for p in seen-required}) != 10:
        raise ConfigurationError('Incomplete manifest')
    return items


def release_file_cache(file, start, end, written=False):
    """Return consumed disk pages, not file bytes; never issue global cache drops."""
    if not hasattr(os,'posix_fadvise') or not hasattr(os,'POSIX_FADV_DONTNEED'):
        return
    if written:
        # Dirty pages cannot reliably be discarded. Persist bounded batches first.
        file.flush()
        os.fdatasync(file.fileno())
    try:
        os.posix_fadvise(file.fileno(),start,end-start,os.POSIX_FADV_DONTNEED)
    except OSError:
        pass  # Some filesystems decline advisory cache eviction.


def digest(path):
    checksum=hashlib.sha256(); consumed=0; released=0
    with Path(path).open('rb') as source:
        while chunk := source.read(1024*1024):
            checksum.update(chunk); consumed+=len(chunk)
            if consumed-released>=8*1024*1024:
                release_file_cache(source,released,consumed)
                released=consumed
        if consumed>released:
            release_file_cache(source,released,consumed)
    return checksum.hexdigest()


def valid_file(path,item):
    return path.is_file() and path.stat().st_size == item['bytes'] and digest(path) == item['sha256']


class S3Source:
    def __init__(self,env):
        self.endpoint = env.get('CHARGE_GAP_S3_ENDPOINT','').rstrip('/')
        try:
            parts = urlsplit(self.endpoint)
            endpoint_port = parts.port
        except ValueError:
            raise ConfigurationError('Invalid S3 endpoint',code='S3_ENDPOINT_INVALID') from None
        self.bucket = env.get('CHARGE_GAP_S3_BUCKET','')
        self.prefix = env.get('CHARGE_GAP_S3_PREFIX','').strip('/')
        self.access = env.get('CHARGE_GAP_S3_ACCESS_KEY_ID','')
        self.secret = env.get('CHARGE_GAP_S3_SECRET_ACCESS_KEY','')
        self.token = env.get('CHARGE_GAP_S3_SESSION_TOKEN','')
        self.region = env.get('CHARGE_GAP_S3_REGION','auto')
        if (parts.scheme != 'https' or not parts.hostname or parts.username or parts.password
                or parts.query or parts.fragment or parts.path or endpoint_port not in (None,443)):
            raise ConfigurationError('Configure an HTTPS S3 endpoint without path or credentials',code='S3_ENDPOINT_INVALID')
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', self.bucket):
            raise ConfigurationError('Configure an S3 bucket',code='S3_BUCKET_INVALID')
        if '..' in PurePosixPath(self.prefix).parts or '\\' in self.prefix:
            raise ConfigurationError('Invalid object prefix',code='S3_PREFIX_INVALID')
        if not re.fullmatch('[a-z0-9-]+',self.region):
            raise ConfigurationError('Configure S3 region',code='S3_REGION_INVALID')
        if not self.access.strip() or not self.secret.strip():
            raise ConfigurationError('Configure S3 read credentials',code='S3_CREDENTIALS_MISSING')

    def request(self,item,now=None):
        now = now or datetime.now(timezone.utc)
        stamp = now.strftime('%Y%m%dT%H%M%SZ'); day=stamp[:8]
        key = '/'.join(filter(None,[self.bucket,self.prefix,item['path']]))
        uri = '/'+quote(key,safe='/~')
        payload_hash = hashlib.sha256(b'').hexdigest()
        headers = {'host':urlsplit(self.endpoint).netloc,'x-amz-date':stamp,
                   'x-amz-content-sha256':payload_hash}
        if self.token:
            headers['x-amz-security-token']=self.token
        names=';'.join(sorted(headers))
        canonical_headers=''.join(k+':'+headers[k].strip()+'\n' for k in sorted(headers))
        canonical='\n'.join(['GET',uri,'',canonical_headers,names,payload_hash])
        scope=f'{day}/{self.region}/s3/aws4_request'
        to_sign='\n'.join(['AWS4-HMAC-SHA256',stamp,scope,hashlib.sha256(canonical.encode()).hexdigest()])
        signing_key=('AWS4'+self.secret).encode()
        for part in [day,self.region,'s3','aws4_request']:
            signing_key=hmac.new(signing_key,part.encode(),hashlib.sha256).digest()
        signature=hmac.new(signing_key,to_sign.encode(),hashlib.sha256).hexdigest()
        headers['Authorization']=f'AWS4-HMAC-SHA256 Credential={self.access}/{scope}, SignedHeaders={names}, Signature={signature}'
        return Request(self.endpoint+uri,headers=headers,method='GET')


def mib(count):
    return f'{count/MIB:.1f} MiB'


def sync_data(root,items,source,open_request=None,sleep=time.sleep,limits=None,clock=time.monotonic,log=None):
    """Download and verify every artifact before one shared deadline.

    The deadline covers all artifacts, attempts and retry waits, so retries can never extend
    the bootstrap. A transfer whose throughput drops below limits.stall_min_bytes per
    limits.stall_s is treated as stalled and retried. Logs carry artifact numbers, sizes,
    rates and fixed error codes only: never URLs, bucket names, object keys or credentials.
    """
    root=Path(root).resolve()
    limits=limits or DownloadLimits()
    log=log or (lambda message: None)
    started=clock()
    deadline=started+limits.deadline_s
    total=len(items)
    opener=build_opener(NoRedirect())
    # Each blocking connect/read waits at most the socket timeout and never past the deadline.
    open_request=open_request or (lambda req:opener.open(req,timeout=max(1.0,min(limits.socket_timeout_s,deadline-clock()))))
    reported_limits=False
    downloaded=0
    for artifact_index,item in enumerate(items,1):
        target=(root/item['path']).resolve()
        if not target.is_relative_to(root):
            raise ConfigurationError('Artifact outside data root')
        if valid_file(target,item):
            log(f'Artifact {artifact_index}/{total}: already present and verified ({mib(item["bytes"])})')
            continue
        if not reported_limits:
            log('Download limits: '+limits.describe())
            reported_limits=True
        target.parent.mkdir(parents=True,exist_ok=True)
        expected=item['bytes']
        for attempt in range(1,ATTEMPTS+1):
            temporary=None
            size=0
            try:
                if clock()>=deadline:
                    raise DownloadError('Download deadline exceeded',code='DOWNLOAD_DEADLINE_EXCEEDED')
                attempt_started=clock()
                log(f'Artifact {artifact_index}/{total}: download started ({mib(expected)} expected, attempt {attempt}/{ATTEMPTS})')
                with open_request(source.request(item)) as response, tempfile.NamedTemporaryFile(
                        dir=target.parent,prefix='.download-',delete=False) as output:
                    temporary=Path(output.name); released=0; checksum=hashlib.sha256()
                    # read1 returns what has arrived (bounded by CHUNK), so stall checks run while data trickles in.
                    read=getattr(response,'read1',None) or response.read
                    window_started=attempt_started; window_bytes=0
                    logged_bytes=0; logged_at=attempt_started
                    while chunk := read(CHUNK):
                        now=clock()
                        size += len(chunk); window_bytes += len(chunk)
                        if size > expected:
                            raise DownloadError('Artifact exceeds expected size',code='ARTIFACT_TOO_LARGE')
                        output.write(chunk); checksum.update(chunk)
                        if size-released>=8*MIB:
                            release_file_cache(output,released,size,written=True)
                            released=size
                        if now>=deadline:
                            raise DownloadError('Download deadline exceeded',code='DOWNLOAD_DEADLINE_EXCEEDED')
                        if now-window_started>=limits.stall_s:
                            if window_bytes<limits.stall_min_bytes:
                                raise DownloadError('Download stalled',code='DOWNLOAD_STALLED')
                            window_started=now; window_bytes=0
                        if size<expected and (size-logged_bytes>=limits.progress_bytes
                                or (now-logged_at>=limits.progress_s and size>logged_bytes)):
                            elapsed=max(now-attempt_started,1e-9)
                            log(f'Artifact {artifact_index}/{total}: {mib(size)} / {mib(expected)} '
                                f'({size*1000//expected/10:.1f}%), {size/MIB/elapsed:.2f} MiB/s, {now-attempt_started:.0f}s')
                            logged_bytes=size; logged_at=now
                    if size>released:
                        release_file_cache(output,released,size,written=True)
                if size != expected or checksum.hexdigest()!=item['sha256']:
                    raise DownloadError('Artifact verification failed',code='ARTIFACT_VERIFICATION_FAILED')
                os.replace(temporary,target)
                temporary=None
                downloaded+=1
                elapsed=max(clock()-attempt_started,1e-9)
                log(f'Artifact {artifact_index}/{total}: verified {mib(size)} in {elapsed:.0f}s ({size/MIB/elapsed:.2f} MiB/s)')
                break
            except Exception as exc:
                # Exceptions can contain private endpoints, credentials or provider XML.
                provider_code=s3_error_code(exc)
                code,status=download_failure(exc)
                remaining=deadline-clock()
                final=attempt==ATTEMPTS or code=='DOWNLOAD_DEADLINE_EXCEEDED' or remaining<=0
                if final:
                    if remaining<=0 and code!='DOWNLOAD_DEADLINE_EXCEEDED' and attempt<ATTEMPTS:
                        code,status='DOWNLOAD_DEADLINE_EXCEEDED',None  # Time ran out before the next attempt.
                    raise DownloadError('Artifact download or verification failed',code=code,
                        http_status=status,provider_code=provider_code,artifact_index=artifact_index,
                        received_bytes=size,expected_bytes=expected,elapsed_s=int(clock()-started)) from None
                wait=min(2**(attempt-1),remaining)
                log(f'Artifact {artifact_index}/{total}: attempt {attempt}/{ATTEMPTS} failed ({code}'
                    f'{"; HTTP "+str(status) if status else ""}) after {mib(size)}; retrying in {wait:.0f}s, '
                    f'{remaining:.0f}s left before the deadline')
                sleep(wait)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
    return downloaded


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--verify-local',type=Path)
    args=parser.parse_args()
    stage='manifest_validation'
    try:
        items=load_manifest(Path(__file__).with_name('data-manifest.json'))
        if args.verify_local:
            if not all(valid_file(args.verify_local/item['path'],item) for item in items):
                raise DownloadError('Local artifact verification failed')
            print(f'Verified {len(items)} files, {sum(i["bytes"] for i in items)} bytes')
        else:
            stage='download_limits'
            limits=DownloadLimits.from_env(os.environ)
            stage='storage_configuration'
            source=S3Source(os.environ)
            stage='artifact_download'
            started=time.monotonic()
            log=lambda message: print(message,flush=True)
            log(f'Data bootstrap: {len(items)} artifacts, {mib(sum(i["bytes"] for i in items))} expected')
            # Positional order: root, items, source, open_request, sleep, limits, clock, log.
            count=sync_data('/app',items,source,None,time.sleep,limits,time.monotonic,log)
            print(f'Data ready: {len(items)} verified, {count} downloaded in {time.monotonic()-started:.0f}s',flush=True)
    except ConfigurationError as exc:
        code=exc.code if exc.code in CONFIG_DIAGNOSTICS else 'MANIFEST_INVALID'
        print(f'Data bootstrap failed [{stage}]: {code}; {CONFIG_DIAGNOSTICS[code]}',flush=True)
        raise SystemExit(1) from None
    except DownloadError as exc:
        code=exc.code if exc.code in FAILURE_CODES else 'DOWNLOAD_FAILED'
        status=f'; HTTP {exc.http_status}' if type(exc.http_status) is int and 100 <= exc.http_status <= 599 else ''
        provider=f'; S3 {exc.provider_code}' if exc.provider_code in S3_ERROR_CODES else ''
        artifact=f'; artifact_index={exc.artifact_index}' if type(exc.artifact_index) is int and 1 <= exc.artifact_index <= 14 else ''
        progress=(f'; received={exc.received_bytes}/{exc.expected_bytes} bytes'
                  if type(exc.received_bytes) is int and type(exc.expected_bytes) is int else '')
        elapsed=f'; elapsed={exc.elapsed_s}s' if type(exc.elapsed_s) is int else ''
        print(f'Data bootstrap failed [{stage}]: {code}{status}{provider}{artifact}{progress}{elapsed}',flush=True)
        raise SystemExit(1) from None
    except Exception as exc:
        print(f'Data bootstrap failed [{stage}]: '+type(exc).__name__,flush=True)
        raise SystemExit(1) from None


if __name__=='__main__':
    main()

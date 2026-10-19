"""Private S3-compatible startup download; stdlib only, bounded memory, no URLs in logs."""
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


class ConfigurationError(ValueError):
    pass


class DownloadError(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward credentials to a redirect target.


def load_manifest(path):
    items = json.loads(Path(path).read_text(encoding='utf-8'))['files']
    required = {'data/processed/charger_info_clean.csv',
                'data/processed/ev_registration_by_region_2025.csv',
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
        parts = urlsplit(self.endpoint)
        self.bucket = env.get('CHARGE_GAP_S3_BUCKET','')
        self.prefix = env.get('CHARGE_GAP_S3_PREFIX','').strip('/')
        self.access = env.get('CHARGE_GAP_S3_ACCESS_KEY_ID','')
        self.secret = env.get('CHARGE_GAP_S3_SECRET_ACCESS_KEY','')
        self.token = env.get('CHARGE_GAP_S3_SESSION_TOKEN','')
        self.region = env.get('CHARGE_GAP_S3_REGION','auto')
        if (parts.scheme != 'https' or not parts.hostname or parts.username or parts.password
                or parts.query or parts.fragment or parts.path or parts.port not in (None,443)):
            raise ConfigurationError('Configure an HTTPS S3 endpoint without path or credentials')
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', self.bucket):
            raise ConfigurationError('Configure an S3 bucket')
        if '..' in PurePosixPath(self.prefix).parts or '\\' in self.prefix:
            raise ConfigurationError('Invalid object prefix')
        if not self.access or not self.secret or not re.fullmatch('[a-z0-9-]+',self.region):
            raise ConfigurationError('Configure S3 read credentials and region')

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


def sync_data(root,items,source,open_request=None,sleep=time.sleep):
    root=Path(root).resolve()
    opener=build_opener(NoRedirect())
    open_request=open_request or (lambda req:opener.open(req,timeout=60))
    downloaded=0
    for item in items:
        target=(root/item['path']).resolve()
        if not target.is_relative_to(root):
            raise ConfigurationError('Artifact outside data root')
        if valid_file(target,item):
            continue
        target.parent.mkdir(parents=True,exist_ok=True)
        for attempt in range(3):
            temporary=None
            try:
                with open_request(source.request(item)) as response, tempfile.NamedTemporaryFile(
                        dir=target.parent,prefix='.download-',delete=False) as output:
                    temporary=Path(output.name); size=0; released=0; checksum=hashlib.sha256()
                    while chunk := response.read(1024*1024):
                        size += len(chunk)
                        if size > item['bytes']:
                            raise DownloadError('Artifact exceeds expected size')
                        output.write(chunk); checksum.update(chunk)
                        if size-released>=8*1024*1024:
                            release_file_cache(output,released,size,written=True)
                            released=size
                    if size>released:
                        release_file_cache(output,released,size,written=True)
                if size != item['bytes'] or checksum.hexdigest()!=item['sha256']:
                    raise DownloadError('Artifact verification failed')
                os.replace(temporary,target)
                downloaded+=1
                break
            except Exception:
                # Exceptions can contain private endpoints, credentials or provider XML.
                if attempt==2:
                    raise DownloadError('Artifact download or verification failed') from None
                sleep(2**attempt)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
    return downloaded


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--verify-local',type=Path)
    args=parser.parse_args()
    try:
        items=load_manifest(Path(__file__).with_name('data-manifest.json'))
        if args.verify_local:
            if not all(valid_file(args.verify_local/item['path'],item) for item in items):
                raise DownloadError('Local artifact verification failed')
            print(f'Verified {len(items)} files, {sum(i["bytes"] for i in items)} bytes')
        else:
            count=sync_data('/app',items,S3Source(os.environ))
            print(f'Data ready: {len(items)} verified, {count} downloaded',flush=True)
    except Exception as exc:
        print('Data bootstrap failed: '+type(exc).__name__,flush=True)
        raise SystemExit(1) from None


if __name__=='__main__':
    main()

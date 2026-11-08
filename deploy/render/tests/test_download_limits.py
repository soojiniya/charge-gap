"""P1 startup diagnostics: shared deadline, stall detection, progress logs and boot stages.

Time is simulated with a fake clock, so no test waits in real time.
"""
import hashlib
import io
from pathlib import Path
import subprocess
import sys

import pytest

DEPLOY=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(DEPLOY))
import download_data
from download_data import ConfigurationError, DownloadError, DownloadLimits, S3Source, sync_data
import start

MIB=1024*1024
SENSITIVE=['PRIVATE_ENDPOINT_SENTINEL','private-bucket-sentinel','snapshots/sentinel','ACCESSSENTINEL','SECRETSENTINEL',
           'charger_info_clean','data/processed','https://']


class Clock:
    def __init__(self):
        self.now=1000.0
    def __call__(self):
        return self.now
    def advance(self,seconds):
        self.now+=seconds


@pytest.fixture
def source():
    return S3Source({'CHARGE_GAP_S3_ENDPOINT':'https://PRIVATE_ENDPOINT_SENTINEL.example.com',
        'CHARGE_GAP_S3_BUCKET':'private-bucket-sentinel','CHARGE_GAP_S3_PREFIX':'snapshots/sentinel',
        'CHARGE_GAP_S3_ACCESS_KEY_ID':'ACCESSSENTINEL','CHARGE_GAP_S3_SECRET_ACCESS_KEY':'SECRETSENTINEL'})


def artifact(body,name='data/processed/charger_info_clean.csv'):
    return {'path':name,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}


class Paced(io.RawIOBase):
    """A response that hands out `step` bytes per read and advances the fake clock by `seconds` per read."""
    def __init__(self,body,clock,step,seconds,limit=None):
        self.body=body; self.pos=0; self.clock=clock; self.step=step; self.seconds=seconds; self.limit=limit
        self.sizes=[]
    def read1(self,size=-1):
        self.sizes.append(size)
        if self.limit is not None and self.pos>=self.limit:
            self.clock.advance(self.seconds)
            return self.body[self.pos:self.pos+1]  # a trickle of one byte per read
        chunk=self.body[self.pos:self.pos+min(self.step,size)]
        self.pos+=len(chunk); self.clock.advance(self.seconds)
        return chunk
    def __enter__(self):
        return self
    def __exit__(self,*args):
        return False


def no_secret(text):
    return not any(token in text for token in SENSITIVE)


# ---- limits from the environment -------------------------------------------------------------

def test_limit_defaults_favour_slow_downloads():
    limits=DownloadLimits.from_env({})
    assert (limits.deadline_s,limits.stall_s,limits.stall_min_bytes,limits.socket_timeout_s)==(900,60,65536,30)


def test_limits_are_configurable():
    limits=DownloadLimits.from_env({'CHARGE_GAP_DOWNLOAD_DEADLINE_S':'1800','CHARGE_GAP_DOWNLOAD_STALL_S':'120',
        'CHARGE_GAP_DOWNLOAD_STALL_MIN_BYTES':'1024','CHARGE_GAP_DOWNLOAD_SOCKET_TIMEOUT_S':'45'})
    assert (limits.deadline_s,limits.stall_s,limits.stall_min_bytes,limits.socket_timeout_s)==(1800,120,1024,45)


@pytest.mark.parametrize('env',[
    {'CHARGE_GAP_DOWNLOAD_DEADLINE_S':'PRIVATE_SENTINEL'},
    {'CHARGE_GAP_DOWNLOAD_DEADLINE_S':'59'},
    {'CHARGE_GAP_DOWNLOAD_DEADLINE_S':'3601'},
    {'CHARGE_GAP_DOWNLOAD_DEADLINE_S':'-5'},
    {'CHARGE_GAP_DOWNLOAD_DEADLINE_S':'1.5'},
    {'CHARGE_GAP_DOWNLOAD_STALL_S':'9'},
    {'CHARGE_GAP_DOWNLOAD_STALL_MIN_BYTES':'0'},
    {'CHARGE_GAP_DOWNLOAD_SOCKET_TIMEOUT_S':'301'},
    {'CHARGE_GAP_DOWNLOAD_DEADLINE_S':'120','CHARGE_GAP_DOWNLOAD_STALL_S':'120'},
])
def test_invalid_limits_are_rejected(env):
    with pytest.raises(ConfigurationError) as exc:DownloadLimits.from_env(env)
    assert exc.value.code=='DOWNLOAD_LIMITS_INVALID'


def test_invalid_limits_stop_bootstrap_without_echoing_value(monkeypatch,capsys):
    monkeypatch.setattr(download_data.os,'environ',{'CHARGE_GAP_DOWNLOAD_DEADLINE_S':'PRIVATE_SENTINEL'})
    monkeypatch.setattr(sys,'argv',['download_data.py'])
    monkeypatch.setattr(download_data,'sync_data',lambda *a,**k:pytest.fail('Must not download'))
    with pytest.raises(SystemExit):download_data.main()
    output=capsys.readouterr().out
    assert '[download_limits]: DOWNLOAD_LIMITS_INVALID' in output and 'PRIVATE_SENTINEL' not in output


# ---- normal and slow downloads -----------------------------------------------------------------

def test_normal_download_logs_progress_without_sensitive_values(tmp_path,source):
    clock=Clock(); body=b'a'*(5*MIB); item=artifact(body); lines=[]
    limits=DownloadLimits(progress_bytes=2*MIB)
    stream=Paced(body,clock,MIB,1)
    assert sync_data(tmp_path,[item],source,lambda _:stream,lambda _:None,limits,clock,lines.append)==1
    assert (tmp_path/item['path']).read_bytes()==body
    assert download_data.digest(tmp_path/item['path'])==item['sha256']
    text='\n'.join(lines)
    assert lines[0].startswith('Download limits: deadline 900s')
    assert 'Artifact 1/1: download started (5.0 MiB expected, attempt 1/3)' in text
    assert 'Artifact 1/1: 2.0 MiB / 5.0 MiB (40.0%)' in text and 'Artifact 1/1: 4.0 MiB / 5.0 MiB (80.0%)' in text
    assert lines[-1].startswith('Artifact 1/1: verified 5.0 MiB in 6s')
    assert no_secret(text)
    assert set(stream.sizes)=={MIB}  # bounded reads: never more than 1 MiB at a time


def test_time_based_progress_for_slow_links(tmp_path,source):
    clock=Clock(); body=b'b'*(MIB); item=artifact(body); lines=[]
    stream=Paced(body,clock,64*1024,10)   # 64 KiB every 10 s: slow but healthy
    sync_data(tmp_path,[item],source,lambda _:stream,lambda _:None,DownloadLimits(),clock,lines.append)
    progress=[l for l in lines if '%)' in l]
    assert progress and all('MiB/s' in l for l in progress)


def test_slow_but_healthy_download_is_not_cut(tmp_path,source):
    # 2 MiB at 128 KiB per 30 s (about 4 KiB/s) takes 480 s: above the stall floor, inside the deadline.
    clock=Clock(); body=b's'*(2*MIB); item=artifact(body); sleeps=[]
    stream=Paced(body,clock,128*1024,30)
    assert sync_data(tmp_path,[item],source,lambda _:stream,sleeps.append,DownloadLimits(),clock)==1
    assert sleeps==[] and clock.now-1000>=480
    assert download_data.digest(tmp_path/item['path'])==item['sha256']


def test_reads_fall_back_to_read_when_read1_is_missing(tmp_path,source):
    body=b'r'*(3*MIB+1); item=artifact(body); sizes=[]
    class Plain:
        def __init__(self):self.data=io.BytesIO(body)
        def read(self,size=-1):
            sizes.append(size); return self.data.read(size)
        def __enter__(self):return self
        def __exit__(self,*a):return False
    assert sync_data(tmp_path,[item],source,lambda _:Plain(),lambda _:None)==1
    assert set(sizes)=={MIB}


# ---- stall detection ---------------------------------------------------------------------------

def test_stalled_transfer_is_retried_then_reported(tmp_path,source):
    clock=Clock(); body=b'c'*MIB; item=artifact(body); sleeps=[]; calls=[]; lines=[]
    def fetch(_):
        calls.append(1)
        return Paced(body,clock,1024,20)   # 1 KiB per 20 s: 3 KiB per 60 s window < 64 KiB
    with pytest.raises(DownloadError) as exc:
        sync_data(tmp_path,[item],source,fetch,lambda s:(sleeps.append(s),clock.advance(s)),DownloadLimits(),clock,lines.append)
    assert exc.value.code=='DOWNLOAD_STALLED' and exc.value.artifact_index==1
    assert len(calls)==3 and sleeps==[1,2]
    assert exc.value.received_bytes==3*1024 and exc.value.expected_bytes==MIB
    assert sum('failed (DOWNLOAD_STALLED)' in l for l in lines)==2
    assert not list(tmp_path.rglob('.download-*'))


def test_stall_then_successful_retry(tmp_path,source):
    clock=Clock(); body=b'd'*MIB; item=artifact(body); calls=[]
    def fetch(_):
        calls.append(1)
        return Paced(body,clock,1024,20) if len(calls)==1 else Paced(body,clock,MIB,1)
    assert sync_data(tmp_path,[item],source,fetch,clock.advance,DownloadLimits(),clock)==1
    assert len(calls)==2
    assert (tmp_path/item['path']).read_bytes()==body


def test_trickle_after_good_start_is_detected(tmp_path,source):
    clock=Clock(); body=b'e'*(4*MIB); item=artifact(body)
    def fetch(_):
        return Paced(body,clock,MIB,1,limit=MIB)   # 1 MiB quickly, then one byte per read
    with pytest.raises(DownloadError) as exc:
        sync_data(tmp_path,[item],source,fetch,clock.advance,DownloadLimits(stall_min_bytes=4096),clock)
    assert exc.value.code=='DOWNLOAD_STALLED'


# ---- one deadline for everything ---------------------------------------------------------------

def test_deadline_is_shared_by_retries(tmp_path,source):
    clock=Clock(); item=artifact(b'f'*100); calls=[]; sleeps=[]
    def fetch(_):
        calls.append(1); clock.advance(35)
        raise TimeoutError('PRIVATE_SENTINEL')
    with pytest.raises(DownloadError) as exc:
        sync_data(tmp_path,[item],source,fetch,lambda s:(sleeps.append(s),clock.advance(s)),DownloadLimits(deadline_s=60,stall_s=30),clock)
    # attempt 1: 0-35 s, wait 1 s, attempt 2: 36-71 s -> deadline passed, no third attempt.
    assert exc.value.code=='DOWNLOAD_DEADLINE_EXCEEDED'
    assert len(calls)==2 and sleeps==[1]
    assert 'PRIVATE_SENTINEL' not in str(exc.value)


def test_retry_wait_never_passes_the_deadline(tmp_path,source):
    clock=Clock(); item=artifact(b'g'*100); sleeps=[]
    def fetch(_):
        clock.advance(59.5)
        raise TimeoutError()
    with pytest.raises(DownloadError) as exc:
        sync_data(tmp_path,[item],source,fetch,lambda s:(sleeps.append(s),clock.advance(s)),DownloadLimits(deadline_s=60,stall_s=30),clock)
    assert sleeps==[0.5] and exc.value.code=='DOWNLOAD_DEADLINE_EXCEEDED'


def test_deadline_during_streaming_read_is_final(tmp_path,source):
    clock=Clock(); body=b'h'*(8*MIB); item=artifact(body); calls=[]
    target=tmp_path/item['path']; target.parent.mkdir(parents=True); target.write_bytes(b'previous copy')
    def fetch(_):
        calls.append(1); return Paced(body,clock,MIB,10)   # 1 MiB per 10 s: healthy, but 80 s > deadline
    with pytest.raises(DownloadError) as exc:
        sync_data(tmp_path,[item],source,fetch,clock.advance,DownloadLimits(deadline_s=60,stall_s=30),clock)
    assert exc.value.code=='DOWNLOAD_DEADLINE_EXCEEDED' and len(calls)==1
    assert exc.value.received_bytes==6*MIB and exc.value.elapsed_s==60
    assert target.read_bytes()==b'previous copy'
    assert not list(tmp_path.rglob('.download-*'))


def test_deadline_spans_artifacts(tmp_path,source):
    clock=Clock(); first=b'i'*(3*MIB); second=b'j'*10   # 3 chunks + EOF read = 60 s
    items=[artifact(first),artifact(second,'reports/chart_verification.json')]; calls=[]
    def fetch(request):
        calls.append(1)
        return Paced(first,clock,MIB,15) if len(calls)==1 else pytest.fail('Second artifact must not start')
    with pytest.raises(DownloadError) as exc:
        sync_data(tmp_path,items,source,fetch,clock.advance,DownloadLimits(deadline_s=60,stall_s=30),clock)
    assert exc.value.code=='DOWNLOAD_DEADLINE_EXCEEDED' and exc.value.artifact_index==2
    assert (tmp_path/items[0]['path']).read_bytes()==first


def test_default_socket_timeout_is_capped_by_remaining_time(tmp_path,source,monkeypatch):
    clock=Clock(); body=b'k'*10; item=artifact(body); timeouts=[]
    class Opener:
        def open(self,request,timeout):
            timeouts.append(timeout); clock.advance(50)
            raise TimeoutError()
    monkeypatch.setattr(download_data,'build_opener',lambda *handlers:Opener())
    with pytest.raises(DownloadError):
        sync_data(tmp_path,[item],source,None,clock.advance,DownloadLimits(deadline_s=120,stall_s=30,socket_timeout_s=60),clock)
    # 120 s left -> 60 s cap; after 51 s -> 60 s cap; after 103 s -> 17 s left
    assert timeouts==[60,60,pytest.approx(17)]


# ---- verification is unchanged ---------------------------------------------------------------

def test_sha256_mismatch_is_still_rejected_and_retried(tmp_path,source):
    clock=Clock(); good=b'l'*MIB; bad=b'm'*MIB; item=artifact(good); calls=[]
    def fetch(_):
        calls.append(1); return Paced(bad,clock,MIB,1)
    with pytest.raises(DownloadError) as exc:
        sync_data(tmp_path,[item],source,fetch,clock.advance,DownloadLimits(),clock)
    assert exc.value.code=='ARTIFACT_VERIFICATION_FAILED' and len(calls)==3
    assert not (tmp_path/item['path']).exists()


def test_bundled_manifest_digests_unchanged():
    items=download_data.load_manifest(DEPLOY/'data-manifest.json')
    csv=next(i for i in items if i['path']=='data/processed/charger_info_clean.csv')
    assert csv['bytes']==240535251
    assert csv['sha256']=='6cf8e89777a7720fdbb9f6800e555424896d870c4f45a6c5bde2f8012c5d00dd'


# ---- bootstrap output --------------------------------------------------------------------------

def test_main_logs_summary_and_ready_line(monkeypatch,capsys,source):
    monkeypatch.setattr(sys,'argv',['download_data.py'])
    monkeypatch.setattr(download_data.os,'environ',{})
    monkeypatch.setattr(download_data,'S3Source',lambda env:source)
    received={}
    def fake(root,items,src,open_request,sleep,limits,clock,log):
        received.update(limits=limits); log('Artifact 1/14: verified 1.0 MiB in 1s (1.00 MiB/s)'); return 14
    monkeypatch.setattr(download_data,'sync_data',fake)
    download_data.main()
    output=capsys.readouterr().out
    assert 'Data bootstrap: 14 artifacts, 231.3 MiB expected' in output
    assert 'Data ready: 14 verified, 14 downloaded in' in output
    assert received['limits'].deadline_s==900 and no_secret(output)


@pytest.mark.parametrize('code',['DOWNLOAD_STALLED','DOWNLOAD_DEADLINE_EXCEEDED'])
def test_main_reports_new_codes_with_progress(monkeypatch,capsys,code):
    monkeypatch.setattr(sys,'argv',['download_data.py'])
    monkeypatch.setattr(download_data.os,'environ',{})
    monkeypatch.setattr(download_data,'S3Source',lambda env:None)
    def fail(*args):
        raise DownloadError('PRIVATE_SENTINEL',code=code,artifact_index=1,received_bytes=1048576,
                            expected_bytes=240535251,elapsed_s=900)
    monkeypatch.setattr(download_data,'sync_data',fail)
    with pytest.raises(SystemExit):download_data.main()
    output=capsys.readouterr().out
    assert f'Data bootstrap failed [artifact_download]: {code}; artifact_index=1; received=1048576/240535251 bytes; elapsed=900s' in output
    assert 'PRIVATE_SENTINEL' not in output


# ---- start.py boot stages ------------------------------------------------------------------------

def test_start_logs_every_stage_in_order(monkeypatch,capsys):
    monkeypatch.setenv('PORT','10000')
    monkeypatch.setenv('CHARGE_GAP_CORS_ORIGINS','https://web.example')
    monkeypatch.setenv('CHARGE_GAP_S3_SECRET_ACCESS_KEY','PRIVATE_SENTINEL')
    monkeypatch.delenv('CHARGE_GAP_DOWNLOAD_DEADLINE_S',raising=False)
    runs=[]
    monkeypatch.setattr(start.subprocess,'run',lambda *a,**k:runs.append(k))
    monkeypatch.setattr(start.os,'execvpe',lambda *a:None)
    start.main()
    lines=[l for l in capsys.readouterr().out.splitlines() if l.startswith('Boot: ')]
    assert lines[0].startswith('Boot: start.py started')
    assert lines[1].startswith('Boot: runtime configuration ok (port 10000, 1 CORS origin(s); download deadline 900s')
    assert lines[2].startswith('Boot: data bootstrap started') and lines[3].startswith('Boot: data bootstrap finished in')
    assert lines[4].startswith('Boot: starting waitress (1 thread)')
    assert runs==[{'check':True,'timeout':1020}]
    assert all('PRIVATE_SENTINEL' not in l and 'web.example' not in l for l in lines)


def test_start_guard_timeout_stops_boot(monkeypatch,capsys):
    monkeypatch.setenv('PORT','10000')
    monkeypatch.setenv('CHARGE_GAP_CORS_ORIGINS','https://web.example')
    monkeypatch.setenv('CHARGE_GAP_DOWNLOAD_DEADLINE_S','300')
    def hang(*a,**k):raise subprocess.TimeoutExpired(['PRIVATE_SENTINEL'],k['timeout'])
    monkeypatch.setattr(start.subprocess,'run',hang)
    launches=[]
    monkeypatch.setattr(start.os,'execvpe',lambda *a:launches.append(a))
    with pytest.raises(SystemExit) as exc:start.main()
    output=capsys.readouterr().out
    assert exc.value.code==1 and not launches
    assert 'Deployment startup failed [data_bootstrap]: TimeoutExpired; guard=420s' in output
    assert 'PRIVATE_SENTINEL' not in output


def test_start_rejects_invalid_limits_before_download(monkeypatch,capsys):
    monkeypatch.setenv('PORT','10000')
    monkeypatch.setenv('CHARGE_GAP_CORS_ORIGINS','https://web.example')
    monkeypatch.setenv('CHARGE_GAP_DOWNLOAD_STALL_S','PRIVATE_SENTINEL')
    monkeypatch.setattr(start.subprocess,'run',lambda *a,**k:pytest.fail('Download must not start'))
    with pytest.raises(SystemExit):start.main()
    output=capsys.readouterr().out
    assert '[runtime_configuration]: CHARGE_GAP_DOWNLOAD_* limits' in output and 'PRIVATE_SENTINEL' not in output

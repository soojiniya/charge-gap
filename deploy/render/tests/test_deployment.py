import io
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest

DEPLOY=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(DEPLOY))
from download_data import ConfigurationError, DownloadError, NoRedirect, S3Source, load_manifest, sync_data
from start import runtime_settings
import start
import download_data


@pytest.fixture
def source():
    return S3Source({'CHARGE_GAP_S3_ENDPOINT':'https://storage.example.com',
        'CHARGE_GAP_S3_BUCKET':'private-bucket','CHARGE_GAP_S3_PREFIX':'snapshots/2026',
        'CHARGE_GAP_S3_ACCESS_KEY_ID':'TESTACCESS','CHARGE_GAP_S3_SECRET_ACCESS_KEY':'TESTSECRET'})


def artifact(body=b'approved test snapshot'):
    return {'path':'data/processed/charger_info_clean.csv','bytes':len(body),
            'sha256':hashlib.sha256(body).hexdigest()}


def test_manifest_includes_exact_runtime_artifacts():
    items=load_manifest(DEPLOY/'data-manifest.json')
    assert len(items)==14
    assert sum(p['bytes'] for p in items)==242523813
    assert sum(p['path'].endswith('.png') for p in items)==10


@pytest.mark.parametrize('mutation', ['traversal','duplicate','missing','bad_digest'])
def test_bad_manifests(tmp_path,mutation):
    document=json.loads((DEPLOY/'data-manifest.json').read_text(encoding='utf-8'))
    if mutation=='traversal':document['files'][0]['path']='../escape.csv'
    if mutation=='duplicate':document['files'][1]=document['files'][0]
    if mutation=='missing':document['files'].pop()
    if mutation=='bad_digest':document['files'][0]['sha256']='invalid'
    path=tmp_path/'manifest.json'; path.write_text(json.dumps(document),encoding='utf-8')
    with pytest.raises(ConfigurationError):load_manifest(path)


def test_streaming_atomic_download_and_reuse(tmp_path,source):
    body=b'x'*(2*1024**2+17); item=artifact(body); calls=[]
    class Stream(io.BytesIO):
        def read(self,size=-1):
            assert size==1024**2
            return super().read(size)
    def fetch(request):
        calls.append(request)
        return Stream(body)
    assert sync_data(tmp_path,[item],source,fetch)==1
    assert (tmp_path/item['path']).read_bytes()==body
    assert sync_data(tmp_path,[item],source,fetch)==0
    assert len(calls)==1
    assert not list(tmp_path.rglob('.download-*'))


def test_linux_writeback_precedes_cache_release_and_hash_stays_exact(tmp_path,source,monkeypatch):
    import os
    events=[]
    monkeypatch.setattr(os,'posix_fadvise',lambda fd,start,length,advice:events.append(('release',length)),raising=False)
    monkeypatch.setattr(os,'POSIX_FADV_DONTNEED',4,raising=False)
    monkeypatch.setattr(os,'fdatasync',lambda fd:events.append(('sync',os.fstat(fd).st_size)),raising=False)
    body=b'x'*(9*1024**2+17);item=artifact(body)
    assert sync_data(tmp_path,[item],source,lambda _:io.BytesIO(body))==1
    assert [event[0] for event in events]==['sync','release','sync','release']
    assert all(events[i][1]>0 for i in [0,2])
    assert download_data.digest(tmp_path/item['path'])==item['sha256']
    assert sum(length for action,length in events if action=='release')==2*len(body)


def test_unsupported_cache_advice_never_weakens_hash_check(tmp_path,source,monkeypatch):
    import os
    monkeypatch.setattr(os,'POSIX_FADV_DONTNEED',4,raising=False)
    def unavailable(*args):raise OSError('Unsupported advice')
    monkeypatch.setattr(os,'posix_fadvise',unavailable,raising=False)
    monkeypatch.setattr(os,'fdatasync',lambda fd:None,raising=False)
    body=b'correct snapshot';item=artifact(body)
    assert sync_data(tmp_path,[item],source,lambda _:io.BytesIO(body))==1
    assert download_data.digest(tmp_path/item['path'])==item['sha256']
    with pytest.raises(DownloadError):
        sync_data(tmp_path,[{**item,'sha256':'0'*64}],source,lambda _:io.BytesIO(body),lambda _:None)


@pytest.mark.parametrize('body',[b'bad',b'x'*100])
def test_bad_hash_or_size_preserves_previous_file(tmp_path,source,body):
    item=artifact(); target=tmp_path/item['path']; target.parent.mkdir(parents=True)
    target.write_bytes(b'previous copy'); sleeps=[]
    with pytest.raises(DownloadError):
        sync_data(tmp_path,[item],source,lambda _:io.BytesIO(body),sleeps.append)
    assert target.read_bytes()==b'previous copy'
    assert sleeps==[1,2]
    assert not list(tmp_path.rglob('.download-*'))


def test_error_redaction_and_retry(tmp_path,source):
    def failing(request):
        raise OSError('private-token and private-url must not be logged')
    with pytest.raises(DownloadError) as exc:
        sync_data(tmp_path,[artifact()],source,failing,lambda _:None)
    assert 'private-token' not in str(exc.value)
    assert 'private-url' not in str(exc.value)


def test_s3_request_authentication_and_no_redirect(source):
    request=source.request(artifact(),datetime(2026,10,18,tzinfo=timezone.utc))
    assert request.full_url=='https://storage.example.com/private-bucket/snapshots/2026/data/processed/charger_info_clean.csv'
    headers={k.lower():v for k,v in request.header_items()}
    assert '20261018/auto/s3/aws4_request' in headers['authorization']
    assert 'TESTSECRET' not in str(headers)
    assert 'TESTACCESS' not in request.full_url
    assert headers['x-amz-date']=='20261018T000000Z'
    assert NoRedirect().redirect_request(None,None,302,'',{},'https://other.example') is None


@pytest.mark.parametrize('endpoint',['http://storage.example','https://user:pass@storage.example',
    'https://storage.example/path','https://storage.example?token=secret'])
def test_invalid_private_endpoints(endpoint):
    with pytest.raises(ConfigurationError):S3Source({'CHARGE_GAP_S3_ENDPOINT':endpoint})


@pytest.mark.parametrize('origin',['','*','http://frontend.example','https://frontend.example/','https://frontend.example/path'])
def test_invalid_production_origins(origin):
    with pytest.raises(ValueError):runtime_settings({'CHARGE_GAP_CORS_ORIGINS':origin})


def test_port_and_exact_origins():
    assert runtime_settings({'PORT':'12345','CHARGE_GAP_CORS_ORIGINS':'https://web.example, https://other.example'})==(
        12345,'https://web.example,https://other.example')
    with pytest.raises(ValueError):runtime_settings({'PORT':'65536','CHARGE_GAP_CORS_ORIGINS':'https://web.example'})


def test_launcher_execs_one_thread_and_drops_storage_credentials(monkeypatch):
    monkeypatch.setenv('PORT','12345')
    monkeypatch.setenv('CHARGE_GAP_CORS_ORIGINS','https://web.example')
    monkeypatch.setenv('CHARGE_GAP_S3_SECRET_ACCESS_KEY','PRIVATE_TEST_VALUE')
    monkeypatch.setenv('OPENBLAS_NUM_THREADS','8')
    launches=[]
    monkeypatch.setattr(start.subprocess,'run',lambda *args,**kwargs:None)
    monkeypatch.setattr(start.os,'execvpe',lambda *args:launches.append(args))
    start.main()
    program,args,env=launches[0]
    assert program=='waitress-serve'
    assert '--host=0.0.0.0' in args and '--port=12345' in args and '--threads=1' in args
    assert env['OPENBLAS_NUM_THREADS']==env['OMP_NUM_THREADS']=='1'
    assert not any(k.startswith('CHARGE_GAP_S3_') for k in env)


def test_failed_download_never_starts_public_app(monkeypatch,capsys):
    monkeypatch.setenv('CHARGE_GAP_CORS_ORIGINS','https://web.example')
    def failed(*args,**kwargs):
        raise RuntimeError('do not expose PRIVATE_DOWNLOAD_URL')
    monkeypatch.setattr(start.subprocess,'run',failed)
    launches=[]
    monkeypatch.setattr(start.os,'execvpe',lambda *args:launches.append(args))
    with pytest.raises(SystemExit):start.main()
    assert not launches
    assert 'PRIVATE_DOWNLOAD_URL' not in capsys.readouterr().out


def test_missing_cors_reports_setting_before_any_download(monkeypatch,capsys):
    monkeypatch.delenv('CHARGE_GAP_CORS_ORIGINS',raising=False)
    monkeypatch.setenv('PORT','10000')
    monkeypatch.setattr(start.subprocess,'run',lambda *a,**k:pytest.fail('Download must not start'))
    with pytest.raises(SystemExit) as exc:start.main()
    assert exc.value.code==1
    output=capsys.readouterr().out
    assert '[runtime_configuration]' in output and 'CHARGE_GAP_CORS_ORIGINS is required' in output


@pytest.mark.parametrize('settings',[
    {'PORT':'PRIVATE_SENTINEL'},
    {'PORT':'0'},
    {'CHARGE_GAP_CORS_ORIGINS':'https://[PRIVATE_SENTINEL'},
    {'CHARGE_GAP_CORS_ORIGINS':'https://frontend.example:PRIVATE_SENTINEL'},
    {'CHARGE_GAP_CORS_ORIGINS':'https://user:PRIVATE_SENTINEL@frontend.example'},
])
def test_runtime_validation_never_echoes_invalid_values(settings,monkeypatch,capsys):
    monkeypatch.setenv('PORT','10000')
    monkeypatch.setenv('CHARGE_GAP_CORS_ORIGINS','https://frontend.example')
    for key,value in settings.items():monkeypatch.setenv(key,value)
    with pytest.raises(SystemExit):start.main()
    assert 'PRIVATE_SENTINEL' not in capsys.readouterr().out


@pytest.mark.parametrize('key,value,code',[
    ('CHARGE_GAP_S3_ENDPOINT','https://storage.example/path?token=PRIVATE_SENTINEL','S3_ENDPOINT_INVALID'),
    ('CHARGE_GAP_S3_ENDPOINT','https://[PRIVATE_SENTINEL','S3_ENDPOINT_INVALID'),
    ('CHARGE_GAP_S3_ENDPOINT','https://storage.example:PRIVATE_SENTINEL','S3_ENDPOINT_INVALID'),
    ('CHARGE_GAP_S3_BUCKET','INVALID_PRIVATE_SENTINEL','S3_BUCKET_INVALID'),
    ('CHARGE_GAP_S3_REGION','','S3_REGION_INVALID'),
    ('CHARGE_GAP_S3_PREFIX','../PRIVATE_SENTINEL','S3_PREFIX_INVALID'),
    ('CHARGE_GAP_S3_ACCESS_KEY_ID','','S3_CREDENTIALS_MISSING'),
    ('CHARGE_GAP_S3_SECRET_ACCESS_KEY','  ','S3_CREDENTIALS_MISSING'),
])
def test_storage_configuration_diagnostics_are_safe(source,key,value,code,monkeypatch,capsys):
    env={'CHARGE_GAP_S3_ENDPOINT':source.endpoint,'CHARGE_GAP_S3_BUCKET':source.bucket,
         'CHARGE_GAP_S3_REGION':'auto','CHARGE_GAP_S3_ACCESS_KEY_ID':'PRIVATE_SENTINEL',
         'CHARGE_GAP_S3_SECRET_ACCESS_KEY':'PRIVATE_SENTINEL'}
    env[key]=value
    monkeypatch.setattr(download_data.os,'environ',env)
    monkeypatch.setattr(sys,'argv',['download_data.py'])
    monkeypatch.setattr(download_data,'sync_data',lambda *a,**k:pytest.fail('Invalid config must not download'))
    with pytest.raises(SystemExit):download_data.main()
    output=capsys.readouterr().out
    assert code in output and '[storage_configuration]' in output
    assert 'PRIVATE_SENTINEL' not in output


def test_r2_root_prefix_defaults_to_empty(source):
    root_source=S3Source({'CHARGE_GAP_S3_ENDPOINT':source.endpoint,
        'CHARGE_GAP_S3_BUCKET':'charge-gap-data','CHARGE_GAP_S3_ACCESS_KEY_ID':source.access,
        'CHARGE_GAP_S3_SECRET_ACCESS_KEY':source.secret})
    assert root_source.region=='auto' and root_source.prefix==''
    assert root_source.request(artifact()).full_url.endswith('/charge-gap-data/'+artifact()['path'])


@pytest.mark.parametrize('kind,code,status',[
    ('http','S3_HTTP_ERROR',403),('timeout','DOWNLOAD_TIMEOUT',None),
    ('network','S3_NETWORK_ERROR',None),('unknown','DOWNLOAD_FAILED',None),
])
def test_bootstrap_errors_keep_safe_category_and_status(tmp_path,source,kind,code,status,monkeypatch,capsys):
    from urllib.error import HTTPError,URLError
    calls=[]
    def fail(request):
        calls.append(1)
        if kind=='http':raise HTTPError('https://PRIVATE_SENTINEL',403,'PRIVATE_SENTINEL',{},io.BytesIO(b'PRIVATE_SENTINEL'))
        if kind=='timeout':raise TimeoutError('PRIVATE_SENTINEL')
        if kind=='network':raise URLError('PRIVATE_SENTINEL')
        raise ValueError('PRIVATE_SENTINEL')
    with pytest.raises(DownloadError) as captured:
        sync_data(tmp_path,[artifact()],source,fail,lambda _:None)
    failure=captured.value
    assert failure.code==code and failure.http_status==status and len(calls)==3
    assert not list(tmp_path.rglob('.download-*'))
    monkeypatch.setattr(sys,'argv',['download_data.py'])
    monkeypatch.setattr(download_data,'S3Source',lambda env:source)
    def failed_sync(*args):raise failure
    monkeypatch.setattr(download_data,'sync_data',failed_sync)
    with pytest.raises(SystemExit):download_data.main()
    output=capsys.readouterr().out
    assert code in output and 'PRIVATE_SENTINEL' not in output
    assert ('HTTP 403' in output)==(status==403)


@pytest.mark.parametrize('provider_code',['AccessDenied','SignatureDoesNotMatch','NoSuchKey','PRIVATE_SENTINEL'])
def test_provider_error_allowlist_and_bounded_body(tmp_path,source,provider_code):
    from urllib.error import HTTPError
    reads=[]
    class ErrorBody(io.BytesIO):
        def read(self,size=-1):
            reads.append(size)
            assert size==4096
            return super().read(size)
    def fail(request):
        body=ErrorBody(f'<Error><Code>{provider_code}</Code><Message>PRIVATE_SENTINEL</Message></Error>'.encode())
        raise HTTPError('https://PRIVATE_SENTINEL',403,'PRIVATE_SENTINEL',{},body)
    with pytest.raises(DownloadError) as captured:
        sync_data(tmp_path,[artifact()],source,fail,lambda _:None)
    failure=captured.value
    assert failure.provider_code==(provider_code if provider_code in download_data.S3_ERROR_CODES else None)
    assert failure.artifact_index==1 and failure.http_status==403
    assert reads==[4096]*3
    assert 'PRIVATE_SENTINEL' not in str(failure)


def test_memory_failure_category(tmp_path,source):
    def fail(request):raise MemoryError('PRIVATE_SENTINEL')
    with pytest.raises(DownloadError) as captured:
        sync_data(tmp_path,[artifact()],source,fail,lambda _:None)
    assert captured.value.code=='MEMORY_ALLOCATION_FAILED'


@pytest.mark.parametrize('returncode',[1,-9])
def test_child_exit_logged_without_command_or_environment(monkeypatch,capsys,returncode):
    monkeypatch.setenv('PORT','10000')
    monkeypatch.setenv('CHARGE_GAP_CORS_ORIGINS','https://charge-gap.onrender.com')
    def fail(*args,**kwargs):
        raise start.subprocess.CalledProcessError(returncode,['PRIVATE_SENTINEL'],output='PRIVATE_SENTINEL')
    monkeypatch.setattr(start.subprocess,'run',fail)
    with pytest.raises(SystemExit):start.main()
    output=capsys.readouterr().out
    assert f'child_exit={returncode}' in output and '[data_bootstrap]' in output
    assert 'PRIVATE_SENTINEL' not in output


def test_main_rejects_unknown_provider_code_in_log(monkeypatch,capsys):
    monkeypatch.setattr(sys,'argv',['download_data.py'])
    monkeypatch.setattr(download_data,'S3Source',lambda env:None)
    def fail(*args):
        raise DownloadError('PRIVATE_SENTINEL',code='S3_HTTP_ERROR',http_status=403,
            provider_code='PRIVATE_SENTINEL',artifact_index=1)
    monkeypatch.setattr(download_data,'sync_data',fail)
    with pytest.raises(SystemExit):download_data.main()
    output=capsys.readouterr().out
    assert 'HTTP 403' in output and 'artifact_index=1' in output
    assert 'PRIVATE_SENTINEL' not in output


@pytest.fixture(scope='module')
def deployed_app():
    sys.path.insert(0,str(DEPLOY.parents[1]/'backend'))
    from chargegap_api import create_app
    return create_app({'PROJECT_ROOT':DEPLOY.parents[1],'CORS_ORIGINS':['https://web.example']})


def test_external_origin_cors(deployed_app):
    with deployed_app.test_client() as client:
        allowed=client.get('/api/charts',headers={'Origin':'https://web.example'})
        denied=client.get('/api/charts',headers={'Origin':'https://untrusted.example'})
    assert allowed.headers['Access-Control-Allow-Origin']=='https://web.example'
    assert 'Origin' in allowed.headers['Vary']
    assert 'Access-Control-Allow-Origin' not in denied.headers


def test_all_ten_png_access_paths(deployed_app):
    items=load_manifest(DEPLOY/'data-manifest.json')
    with deployed_app.test_client() as client:
        charts=client.get('/api/charts').get_json()['data']
        assert len(charts)==10
        for chart in charts:
            item=next(i for i in items if i['path']=='outputs/charts/'+chart['filename'])
            response=client.get(chart['image_url'])
            assert response.status_code==200 and response.mimetype=='image/png'
            assert len(response.data)==item['bytes']
            assert hashlib.sha256(response.data).hexdigest()==item['sha256']

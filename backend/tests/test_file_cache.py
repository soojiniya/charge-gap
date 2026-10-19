import io
import os

import pandas as pd
import pytest

from chargegap_api.file_cache import BATCH, SnapshotReader, open_snapshot


def test_csv_parser_preserves_korean_quotes_ids_and_categories(tmp_path,monkeypatch):
    calls=[]
    monkeypatch.setattr(os,'posix_fadvise',lambda *args:calls.append(args),raising=False)
    monkeypatch.setattr(os,'POSIX_FADV_DONTNEED',4,raising=False)
    path=tmp_path/'snapshot.csv'
    body='statId,chgerId,statNm,lat\nA,01,"한글, 이름",37.1\nB,10,"줄\n바꿈",\n'
    path.write_text(body*1,encoding='utf-8-sig')
    kwargs=dict(dtype={'statId':'category','chgerId':'category','statNm':'category','lat':str},keep_default_na=False)
    expected=pd.read_csv(path,**kwargs)
    with open_snapshot(path) as stream:
        actual=pd.read_csv(stream,**kwargs)
    pd.testing.assert_frame_equal(actual,expected)


@pytest.mark.parametrize('method',['read','read1','readinto','readinto1'])
def test_bounded_consumed_ranges_never_change_bytes(tmp_path,monkeypatch,method):
    calls=[]
    monkeypatch.setattr(os,'posix_fadvise',lambda *args:calls.append(args),raising=False)
    monkeypatch.setattr(os,'POSIX_FADV_DONTNEED',4,raising=False)
    body=(b'0123456789abcdef'*(BATCH//16+1000))
    path=tmp_path/'bytes';path.write_bytes(body)
    chunks=[]
    with SnapshotReader(io.FileIO(path,'r')) as stream:
        while True:
            if 'into' in method:
                buffer=bytearray(262144)
                count=getattr(stream,method)(buffer)
                data=bytes(buffer[:count])
            else:
                data=getattr(stream,method)(262144)
            if not data:break
            chunks.append(data)
            assert all(start+size<=stream.tell() for _,start,size,_ in calls)
    assert b''.join(chunks)==body
    assert calls and max(size for _,_,size,_ in calls)<=BATCH


def test_advice_failure_and_unsupported_platform_preserve_reading(tmp_path,monkeypatch):
    path=tmp_path/'bytes';path.write_bytes(b'x'*8192)
    def unavailable(*args):raise OSError('Advice unsupported')
    monkeypatch.setattr(os,'posix_fadvise',unavailable,raising=False)
    monkeypatch.setattr(os,'POSIX_FADV_DONTNEED',4,raising=False)
    with open_snapshot(path) as stream:
        assert stream.read()==b'x'*8192
    monkeypatch.delattr(os,'posix_fadvise')
    with open_snapshot(path) as stream:
        assert not isinstance(stream,SnapshotReader)
        assert stream.read()==b'x'*8192

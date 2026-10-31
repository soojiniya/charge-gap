"""CHARGE GAP: test by default; nationwide collection requires explicit 'collect'."""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, quote, quote_plus
import xml.etree.ElementTree as ET

import pandas as pd
import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent
URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo'
SOURCE = 'https://www.data.go.kr/data/15076352/openapi.do'
FIELDS = 'statNm statId chgerId chgerType powerType addr lat lng zcode busiId busiNm stat statUpdDt useTime parkingFree note'.split()
REGIONS = dict(zip('11 12 26 27 28 30 31 36 41 43 44 47 48 50 51 52'.split(),
                   '서울 전남광주통합특별시 부산 대구 인천 대전 울산 세종 경기 충북 충남 경북 경남 제주 강원 전북'.split()))
LEGACY = {'42': '51', '45': '52', '29': '12', '46': '12'}
REGION_SOURCE = 'https://stcis.go.kr/org/indicator/cmmnZoneSdListAjax.do'


def now():
    # Fixed UTC+09 avoids depending on the Windows IANA timezone database.
    from datetime import timezone, timedelta
    return datetime.now(timezone(timedelta(hours=9))).isoformat(timespec='seconds')


def write_new(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as stream:
        stream.write(value)


def save_json(path, value):
    write_new(path, json.dumps(value, ensure_ascii=False, indent=2))


def csv_new(frame, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f'기존 CSV 보존: {path}')
    temporary = path.with_suffix(f'.{time.time_ns()}.tmp')
    frame.to_csv(temporary, index=False, encoding='utf-8-sig', mode='x')
    temporary.rename(path)


class CollectionError(Exception):
    pass


class Client:
    def __init__(self, key, delay=1.0):
        self.original_key = key.strip()
        self.key = unquote(key.strip())
        self.delay = delay
        self.session = requests.Session()
        self.last = 0.0
        self.events = []

    def safe(self, value):
        value = str(value)
        for secret in {self.original_key, self.key, quote(self.key, safe=''), quote_plus(self.key)}:
            value = value.replace(secret, '[REDACTED]')
        # Never log request URLs or exception text containing query parameters.
        return value.replace('\r', ' ').replace('\n', ' ')[:300]

    def fetch(self, page, size, allow_effective_size=False):
        for attempt in range(4):
            time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
            event = {'time': now(), 'pageNo': page, 'numOfRows': size, 'attempt': attempt + 1,
                     'http_status': None, 'resultCode': None, 'resultMsg': None}
            retry = False
            try:
                self.last = time.monotonic()
                response = self.session.get(URL, params={'ServiceKey': self.key,
                    'pageNo': page, 'numOfRows': size}, timeout=(10, 60))
                event['http_status'] = response.status_code
                try:
                    root = ET.fromstring(response.content)
                    for element in root.iter():
                        element.tag = element.tag.split('}')[-1]
                    def value(tag):
                        return (root.findtext('.//' + tag) or '').strip()
                    code = value('resultCode') or value('returnReasonCode')
                    message = value('resultMsg') or value('returnAuthMsg') or value('errMsg')
                    event.update(resultCode=self.safe(code), resultMsg=self.safe(message))
                except ET.ParseError:
                    root = None
                    code = ''
                    event['error'] = 'XML 파싱 실패 (응답 본문/URL 비공개)'
                retry = response.status_code in {408, 429, 500, 502, 503, 504} or code in {'01', '02', '04', '05'}
                if response.status_code != 200 or root is None or code != '00':
                    raise CollectionError('HTTP/XML API 응답 오류')
                if not message:
                    raise CollectionError('resultMsg 누락')
                try:
                    total = int(value('totalCount'))
                    returned_page = int(value('pageNo'))
                    returned_size = int(value('numOfRows'))
                except ValueError:
                    raise CollectionError('페이지 메타데이터 누락/형식 오류') from None
                effective_size = size
                requested_expected = min(size, max(0, total - (page - 1) * size))
                if allow_effective_size and page == 1 and returned_size not in {size, requested_expected}:
                    effective_size = returned_size
                expected = min(effective_size, max(0, total - (page - 1) * effective_size))
                event.update(response_page_no=returned_page, response_num_of_rows=returned_size)
                if (total < 0 or returned_page != page or not 10 <= effective_size <= size
                        or returned_size not in {effective_size, expected}):
                    raise CollectionError('페이지 메타데이터 불일치')
                items = [{child.tag: child.text or '' for child in item} for item in root.findall('.//items/item')]
                event.update(returned_rows=len(items), totalCount=total, effective_page_size=effective_size)
                if len(items) != expected:
                    raise CollectionError(f'페이지 건수 불일치: 예상 {expected}, 실제 {len(items)}')
                self.events.append(event)
                return {'pageNo': page, 'numOfRows': effective_size, 'response_numOfRows': returned_size, 'totalCount': total,
                        'fetched_at': now(), 'items': items, 'xml': response.text}
            except requests.RequestException as exc:
                retry = True
                event['error'] = type(exc).__name__
            except CollectionError as exc:
                event['error'] = str(exc)
            self.events.append(event)
            if not retry or attempt == 3:
                raise CollectionError(f'pageNo={page} 요청 실패; 인증키를 제외한 상세 내용은 보고서 참조') from None
            time.sleep(min(30, 2 ** (attempt + 1)) + random.uniform(0, 0.5))


def frame_from(items):
    frame = pd.DataFrame(items, dtype=str)
    for field in FIELDS:
        if field not in frame:
            frame[field] = ''
    return frame[FIELDS + [c for c in frame if c not in FIELDS]].fillna('')


def clean_and_summarize(raw):
    clean = raw.copy()
    for col in clean:
        clean[col] = clean[col].astype('string').str.strip().replace('', pd.NA)
    missing = clean[FIELDS].isna().sum().to_dict()
    keys_ok = clean[['statId', 'chgerId']].notna().all(axis=1)
    duplicate = keys_ok & clean.duplicated(['statId', 'chgerId'], keep='first')
    clean = clean.loc[~duplicate].copy()
    lat = pd.to_numeric(clean.lat, errors='coerce')
    lng = pd.to_numeric(clean.lng, errors='coerce')
    clean['coordinate_valid'] = (lat.between(33, 39.5) & lng.between(124, 132)).fillna(False)
    clean['coordinate_issue'] = 'valid'
    clean.loc[~clean.coordinate_valid, 'coordinate_issue'] = 'outside_korea_bounding_box'
    clean.loc[lat.isna() | lng.isna(), 'coordinate_issue'] = 'non_numeric'
    clean.loc[clean.lat.isna() | clean.lng.isna(), 'coordinate_issue'] = 'missing'
    clean['identity_valid'] = clean[['statId', 'chgerId']].notna().all(axis=1)
    clean['region_code'] = clean.zcode.replace(LEGACY)
    clean['region_valid'] = clean.region_code.isin(REGIONS)
    clean['region_name'] = clean.region_code.map(REGIONS).fillna('미확인')
    parsed_time = pd.to_datetime(clean.statUpdDt, format='%Y%m%d%H%M%S', errors='coerce')
    clean['status_updated_at_valid'] = parsed_time.notna()
    # 한국환경공단 활용가이드 v1.25 §3.3: 11 = DC콤보2(버스전용).
    # https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003680003&fileDetailSn=1
    clean['charger_type_known'] = clean.chgerType.isin([f'{n:02d}' for n in range(1, 12)])
    clean['status_known'] = clean.stat.isin(['0', '1', '2', '3', '4', '5', '6', '9'])
    clean['power_kw'] = pd.to_numeric(clean.get('output', pd.Series(pd.NA, index=clean.index)), errors='coerce')
    # Preserve powerType; do not infer numeric capacity from an empty/type field.
    clean['power_kw_valid'] = (clean.power_kw.gt(0) & clean.power_kw.notna()).fillna(False)
    # Invalid records remain visible with flags; regional totals count identified chargers only.
    valid = clean.loc[clean.identity_valid].copy()
    valid['region_code'] = valid.region_code.where(valid.region_valid, 'unknown')
    valid['deleted_flag'] = valid.get('delYn', pd.Series('', index=valid.index)).eq('Y').fillna(False)
    valid['not_deleted_flag'] = valid.get('delYn', pd.Series('', index=valid.index)).eq('N').fillna(False)
    summary = valid.groupby(['region_code', 'region_name'], dropna=False).agg(
        charger_count=('chgerId', 'size'), station_count=('statId', 'nunique'),
        deleted_flag_charger_count=('deleted_flag', 'sum'),
        not_deleted_flag_charger_count=('not_deleted_flag', 'sum')).reset_index()
    metrics = {'missing_by_field': {k: int(v) for k, v in missing.items()},
               'duplicate_removed': int(duplicate.sum()),
               'missing_identity_rows': int((~clean.identity_valid).sum()),
               'invalid_coordinates': int((~clean.coordinate_valid).sum()),
               'invalid_region_codes': int((~clean.region_valid).sum()),
               'legacy_region_rows': int(raw.zcode.isin(LEGACY).sum()),
               'charger_count': len(valid), 'station_count': int(valid.statId.nunique()),
               'clean_rows': len(clean),
               'coordinate_issue_counts': {str(k): int(v) for k, v in clean.coordinate_issue.value_counts().items()},
               'missing_after_clean': {c: int(clean[c].isna().sum()) for c in FIELDS},
               'invalid_nonmissing_statUpdDt': int((clean.statUpdDt.notna() & ~clean.status_updated_at_valid).sum()),
               'unknown_nonmissing_chgerType': int((clean.chgerType.notna() & ~clean.charger_type_known).sum()),
               'unknown_nonmissing_stat': int((clean.stat.notna() & ~clean.status_known).sum()),
               'power_kw_missing_or_nonpositive': int((~clean.power_kw_valid).sum()),
               'deleted_flag_charger_count': int(valid.deleted_flag.sum()),
               'not_deleted_flag_charger_count': int(valid.not_deleted_flag.sum()),
               'not_deleted_flag_station_count': int(valid.loc[valid.not_deleted_flag, 'statId'].nunique()),
               'stations_in_multiple_regions': int((valid.groupby('statId').region_code.nunique() > 1).sum())}
    return clean, summary, metrics


def checkpoint_save(path, data):
    temporary = path.with_suffix(f'.{time.time_ns()}.tmp')
    save_json(temporary, data)
    temporary.rename(path)


def quality_report(path, info, raw, clean, summary):
    metrics = info['quality']
    lines = ['# CHARGE GAP 데이터 품질 보고서', '',
             f"- 수집 시작: {info['collection_started_at']}",
             f"- 수집 완료: {info['collection_finished_at']}",
             f"- 시작/종료 API totalCount: {info['api_total_count']} / {info['api_total_count_end']}",
             f"- 실제 원본 행 수: {len(raw):,}", f"- 정제 행 수: {len(clean):,}",
             f"- 식별키 중복 제거: {metrics['duplicate_removed']:,}",
             f"- 최종 식별 가능한 충전기 수: {metrics['charger_count']:,}",
             f"- 전국 고유 충전소 수(statId): {metrics['station_count']:,}",
             f"- 식별키 결측 행 수(집계 제외, 정제 데이터에는 보존): {metrics['missing_identity_rows']:,}",
             f"- 좌표 오류/결측 행 수(정제 데이터에 보존): {metrics['invalid_coordinates']:,}",
             f"- 유효하지 않은 지역코드: {metrics['invalid_region_codes']:,}",
             f"- 삭제 표시(delYn=Y) 충전기: {metrics['deleted_flag_charger_count']:,}",
             f"- 비삭제 표시(delYn=N) 충전기: {metrics['not_deleted_flag_charger_count']:,}",
             f"- 비삭제 표시 충전기가 있는 충전소: {metrics['not_deleted_flag_station_count']:,}",
             f"- 여러 지역에 나타난 충전소 ID: {metrics['stations_in_multiple_regions']:,}",
             '', '## 주요 컬럼 결측', '', '| 컬럼 | 원본 결측(공백 포함) | 정제 결측 |', '|---|---:|---:|']
    for field in FIELDS:
        lines.append(f"| {field} | {metrics['missing_by_field'][field]:,} | {metrics['missing_after_clean'][field]:,} |")
    extra = [c for c in raw.columns if c not in FIELDS and not c.startswith('_')]
    lines += ['', '## 원본 추가 필드', '', ', '.join(extra), '',
              '## 지역별 현황', '', '| 지역코드 | 지역 | 충전기 수 | 충전소 수 |', '|---|---|---:|---:|']
    for row in summary.itertuples(index=False):
        lines.append(f'| {row.region_code} | {row.region_name} | {row.charger_count:,} | {row.station_count:,} |')
    lines += ['', '## 검증 기준 및 해석', '',
              '- 원본 CSV는 모든 API item 필드를 문자열로 보존하고 페이지 번호와 조회 시각만 추가했습니다.',
              '- 원본 필드에 없던 요청 컬럼은 빈 값으로 추가했습니다. 모든 XML item 필드 값은 페이지별 JSON 체크포인트에도 보존했습니다.',
              '- 중복 기준은 공백을 정리한 (statId, chgerId)입니다. 충돌 시 첫 조회 행을 유지하며 제거 행은 별도 CSV에 기록합니다.',
              '- 식별키가 없는 행은 서로 중복 처리하지 않습니다. 미확인 식별키는 충전기 수 집계에서 제외합니다.',
              '- 유효하지 않은 좌표는 삭제하지 않으며 data/processed/charger_coordinate_issues.csv에 별도 기록합니다.',
              '- 좌표 검사는 위도 33~39.5, 경도 124~132의 넓은 범위 검사입니다. 행정경계 내 존재 여부는 판단하지 않습니다.',
              '- 현재 16개 시도 기준으로 집계합니다. 지역코드 12는 전남광주통합특별시입니다. 과거 광주/전남으로 임의 분리하지 않습니다.',
              f'- 현재 지역코드 근거: [국가대중교통정보센터 시도 코드]({REGION_SOURCE}) (확인일 2026-10-15).',
              '- 지역코드 42/45 및 29/46은 원본을 보존하고 파생 지역코드에서 각각 51/52 및 12로 대응합니다.',
              '- powerType은 원본 그대로 보존하며 빈 값을 용량으로 추정하지 않습니다. 별도로 제공된 API output 필드는 power_kw에 수치화합니다.',
              '- 알려진 충전기 유형 검사는 01~10, 상태 검사는 0~6 및 9로 제한합니다. 범위 밖 값은 삭제하지 않고 검토 대상으로 남깁니다.',
              '- statUpdDt는 상태 갱신일시이며 설치일이 아닙니다. 설치 연도나 연도별 증가량을 계산하지 않았습니다.',
              '- 현재 조회 시점의 운영 데이터입니다. 2025년 12월 당시 설치 현황을 뜻하지 않습니다.',
              '- 전체 충전기/충전소 및 지역 charger_count에는 삭제 표시 행도 포함합니다. delYn=N 건수는 별도로 제공하며 실제 운영 가능/이용 가능 대수와 동일하지 않습니다.',
              '- 시작/종료 건수와 고유 식별키 수를 비교했습니다. 실시간 페이지 API는 단일 시점 스냅샷을 보장하지 않습니다.',
              '', '## 상세 품질 수치', '', '```json', json.dumps(metrics, ensure_ascii=False, indent=2), '```', '']
    write_new(path, '\n'.join(lines))


def report(path, info, client):
    body = ['# CHARGE GAP 수집 보고서', '',
        f'- 작성 시각: {now()} (UTC+09:00)', f'- API: {URL}', f'- 공식 문서: {SOURCE}',
        '- 기준: 현재 API 조회 결과. statUpdDt는 상태 갱신일시이며 설치일이 아닙니다.',
        '- 2025년 12월 당시 충전기 수를 현재 결과로 재구성하지 않습니다.',
        '- 페이지 순회는 단일 시점 스냅샷을 보장하지 않습니다. 건수 검증 통과도 동일성/완전성을 보장하지 않습니다.',
        '', '## 실행 및 품질 결과', '', '```json',
        json.dumps(info, ensure_ascii=False, indent=2), '```', '', '## API 요청 기록', '', '```json',
        json.dumps(client.events if client else [], ensure_ascii=False, indent=2), '```', '']
    write_new(path, '\n'.join(body))


def main():
    global ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['test', 'collect'], nargs='?', default='test')
    parser.add_argument('--page-size', type=int, default=1000)
    parser.add_argument('--delay', type=float, default=1.0)
    parser.add_argument('--env-file', type=Path, default=Path.cwd() / '.env')
    parser.add_argument('--output-dir', type=Path, default=ROOT)
    parser.add_argument('--seed-page', type=Path, help='Previously verified first-page checkpoint')
    args = parser.parse_args()
    ROOT = args.output_dir.resolve()
    if not 10 <= args.page_size <= 9999 or not math.isfinite(args.delay) or args.delay < 1:
        parser.error('page-size는 10~9999, delay는 최소 1초입니다.')
    for folder in ['data/raw', 'data/processed', 'data/checkpoints', 'reports/history', 'reports/tests']:
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%dT%H%M%S%f')
    report_path = ROOT / 'reports/collection_report.md'
    info = {'mode': args.command, 'started_at': now(), 'status': 'started', 'collected_rows': 0,
            'missing': '미검사', 'duplicates_removed': '미검사'}
    client = None
    try:
        info['env_file'] = str(args.env_file.resolve())
        key = (dotenv_values(args.env_file, interpolate=False).get('DATA_GO_KR_SERVICE_KEY') or '').strip()
        if not key or key in {'YOUR_API_KEY', 'YOUR_SERVICE_KEY'}:
            raise CollectionError('.env의 DATA_GO_KR_SERVICE_KEY가 비어 있습니다. 실제 HTTP 요청은 실행하지 않았습니다.')
        client = Client(key, args.delay)
        # Always test with ten rows before proceeding, including a resumed collection.
        sample = client.fetch(1, 10)
        info.update(api_total_count=sample['totalCount'], test_rows=len(sample['items']), test_at=sample['fetched_at'])
        test_dir = ROOT / f'reports/tests/{stamp}'
        test_dir.mkdir()
        xml = sample['xml']
        for secret in {client.key, client.original_key, quote(client.key, safe=''), quote_plus(client.key)}:
            xml = xml.replace(secret, '[REDACTED]')
        write_new(test_dir / 'response.xml', xml)
        csv_new(frame_from(sample['items']), test_dir / 'sample.csv')
        _, _, quality = clean_and_summarize(frame_from(sample['items']))
        info['test_sample_quality'] = quality
        if args.command == 'test':
            info.update(status='test_success', collected_rows=0,
                        note='연결 테스트만 완료. 전국 원본/정제/집계 CSV는 생성하지 않았습니다.')
            return 0
        outputs = [ROOT / 'data/raw/charger_info_raw.csv', ROOT / 'data/processed/charger_info_clean.csv',
                   ROOT / 'data/processed/charger_by_region.csv']
        if any(p.exists() for p in outputs):
            raise CollectionError('기존 최종 CSV가 있어 중단합니다. 원본을 보존하고 별도 프로젝트에서 새 수집을 시작하세요.')
        checkpoint = ROOT / 'data/checkpoints'
        manifest_path = checkpoint / 'manifest.json'
        seed = None
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            if manifest['page_size'] != args.page_size or manifest['url'] != URL:
                raise CollectionError('이어받기 설정/totalCount 불일치. 체크포인트를 보존하고 새 디렉터리에서 재수집하세요.')
        else:
            if args.seed_page:
                seed = json.loads(args.seed_page.read_text(encoding='utf-8'))
                if seed['pageNo'] != 1 or seed['numOfRows'] != args.page_size:
                    raise CollectionError('검증된 첫 페이지의 설정이 요청과 다릅니다.')
            else:
                seed = client.fetch(1, args.page_size, allow_effective_size=True)
                seed.pop('xml', None)
            args.page_size = seed['numOfRows']
            manifest = {'url': URL, 'page_size': args.page_size, 'total': seed['totalCount'], 'started_at': seed['fetched_at']}
            save_json(manifest_path, manifest)
        if seed and not (checkpoint / 'page_000001.json').exists():
            checkpoint_save(checkpoint / 'page_000001.json', seed)
        info['collection_started_at'] = manifest['started_at']
        info['api_total_count'] = manifest['total']
        info['effective_page_size'] = args.page_size
        total = max(manifest['total'], sample['totalCount'])
        all_items = []
        seen = set()
        info['pages'] = []
        info['count_changes'] = []
        page = 1
        while page <= math.ceil(total / args.page_size):
            path = checkpoint / f'page_{page:06d}.json'
            reused = path.exists()
            if path.exists():
                data = json.loads(path.read_text(encoding='utf-8'))
            else:
                data = client.fetch(page, args.page_size)
                data.pop('xml')
                checkpoint_save(path, data)
            expected = min(args.page_size, max(0, data['totalCount'] - (page - 1) * args.page_size))
            if data['pageNo'] != page or data['numOfRows'] != args.page_size or len(data['items']) != expected:
                raise CollectionError('체크포인트 페이지 검증 실패')
            if data['totalCount'] != total:
                info['count_changes'].append({'page': page, 'previous': total, 'new': data['totalCount']})
            total = data['totalCount']
            repeated = 0
            for item in data['items']:
                key_pair = tuple((item.get(c) or '').strip() for c in ('statId', 'chgerId'))
                if all(key_pair):
                    repeated += int(key_pair in seen)
                    seen.add(key_pair)
                all_items.append(dict(item, _page_no=str(page), _fetched_at=data['fetched_at']))
            info['pages'].append({'pageNo': page, 'rows': len(data['items']), 'totalCount': total,
                                  'duplicate_keys_seen_before': repeated, 'checkpoint_reused': reused,
                                  'fetched_at': data['fetched_at']})
            info['collected_rows'] = len(all_items)
            print(json.dumps({'page': page, 'rows': len(data['items']), 'totalCount': total,
                              'collected_rows': len(all_items), 'duplicate_keys': repeated}), flush=True)
            page += 1
        final_check = client.fetch(1, 10)
        info['api_total_count_end'] = final_check['totalCount']
        info['api_total_count_at_last_page'] = total
        info['delta_raw_vs_end_total'] = len(all_items) - final_check['totalCount']
        raw = frame_from(all_items)
        clean, summary, quality = clean_and_summarize(raw)
        csv_new(raw, outputs[0])
        verified = (not info['count_changes'] and manifest['total'] == final_check['totalCount'] == len(raw)
                    and quality['duplicate_removed'] == quality['missing_identity_rows'] == 0)
        info.update(quality=quality, count_verified=verified,
                    delta_unique_vs_end_total=quality['charger_count'] - final_check['totalCount'])
        csv_new(clean, outputs[1])
        csv_new(summary, outputs[2])
        csv_new(clean.loc[~clean.coordinate_valid], ROOT / 'data/processed/charger_coordinate_issues.csv')
        normalized = raw[['statId', 'chgerId']].apply(lambda col: col.str.strip())
        duplicates = normalized.ne('').all(axis=1) & normalized.duplicated(keep='first')
        csv_new(raw.loc[duplicates], ROOT / 'data/processed/charger_duplicate_rows.csv')
        csv_new(clean.loc[~clean.identity_valid], ROOT / 'data/processed/charger_identity_issues.csv')
        info.update(status='collection_success' if verified else 'collection_complete_with_count_warnings',
                    collection_finished_at=now(),
                    missing=quality['missing_by_field'], duplicates_removed=quality['duplicate_removed'],
                    count_interpretation='행 수/고유키/시작종료 totalCount 일치' if verified else
                    '실시간 totalCount 변동, 식별키 중복/결측 가능성. 페이지 기록과 원본을 비교하세요.')
        quality_report(ROOT / 'reports/data_quality_report.md', info, raw, clean, summary)
        save_json(ROOT / f'reports/history/{stamp}_collection_metrics.json', info)
        return 0
    except (CollectionError, OSError, ValueError) as exc:
        info.update(status='failed', error=client.safe(str(exc)) if client else str(exc))
        return 1
    finally:
        info['finished_at'] = now()
        if report_path.exists():
            report_path.rename(ROOT / f'reports/history/{stamp}_previous.md')
        report(report_path, info, client)
        if client:
            client.session.close()
        print(json.dumps(info, ensure_ascii=True, indent=2))
        print('Report:', report_path)


if __name__ == '__main__':
    sys.exit(main())

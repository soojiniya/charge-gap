from __future__ import annotations

from pathlib import Path
import json
import numpy as np
import pandas as pd
from .file_cache import open_snapshot

REGIONS_2026 = dict(zip('11 12 26 27 28 30 31 36 41 43 44 47 48 50 51 52'.split(),
    '서울 전남광주통합특별시 부산 대구 인천 대전 울산 세종 경기 충북 충남 경북 경남 제주 강원 전북'.split()))
TYPE_DEFINITIONS = {'01':'DC차데모','02':'AC완속','03':'DC차데모+AC3상','04':'DC콤보',
    '05':'DC차데모+DC콤보','06':'DC차데모+AC3상+DC콤보','07':'AC3상','08':'DC콤보(완속)',
    '09':'NACS','10':'DC콤보+NACS','11':'DC콤보2(버스전용)'}
COMMON_PARAMETERS = {'region_code','charger_type','deletion','operator_id'}
UNITS = {'ev_registration_count':'대','charger_count':'기','station_count':'곳','output_kw':'kW','share_pct':'%'}
WARNINGS = [
    '전기차 등록은 2026-09, 충전기 API는 2026-10-15 조회 자료입니다. 서로 다른 시점입니다.',
    '비삭제 표시(delYn=N)는 실제 이용 가능 상태를 뜻하지 않습니다.',
    'statUpdDt는 상태 갱신일시이며 설치일이 아닙니다.',
    '전남광주통합특별시(12)를 과거 광주(29)·전남(46)으로 분할하지 않습니다.',
]
# 출처 표기: 제공기관·작성기관·자료명·자료 기준·파일 저장일(또는 조회 시각)·이용 조건을 구분합니다.
# 충전기 API의 제1유형은 공공데이터포털에서 확인했습니다. 무공해차 공개자료 목록의
# 제1유형 안내는 별도 데이터·통계 화면의 설치 추이 Excel까지 적용되는지 미확인입니다.
# 기존 필드(file, source, reference_month, snapshot_date 등)는 그대로 유지합니다.
# frontend/src/analysis/dataSources.ts와 같은 값이어야 합니다(frontend/tests/data-sources.test.cjs).
EV_SOURCE = {'provider':'국토교통부 통계누리','author':'국토교통부',
    'dataset':'「2026년 09월 자동차 등록자료 통계」 10.연료별_등록현황 (자동차등록현황보고)',
    'reference_basis':'2026년 9월 말 등록 기준','file_saved_date':'2026-10-20',
    'license':'확인 중 (통계누리 저작권보호정책에 따라 출처 표시)','license_confirmed':False,
    'source_url':'https://stat.molit.go.kr/portal/cate/statMetaView.do?hFormId=1244&hRsId=58',
    'file':'ev_registration_by_region_2026_09.csv','reference_month':'2026-09',
    'region_system':'2026_16_provinces','source':'2026년 9월 자동차 등록자료 / 10.연료별_등록현황',
    'region_code_basis':'원본 지역명 전남광주를 기존 충전기 지역코드 12에 대응; 원본 Excel에 숫자 코드 없음',
    'legacy_field_aliases':'region_code_2025 / region_name_2025 are deprecated aliases of current region_code / region_name; not historical values',
    'unit':'대','fuel':'전기 (하이브리드·수소전기 제외)'}
API_SOURCE = {'provider':'한국환경공단','author':'한국환경공단','platform':'공공데이터포털',
    'dataset':'「전기자동차 충전소 정보」 getChargerInfo','reference_basis':'2026-10-15 조회 시점 현황',
    'license':'공공누리 제1유형 (출처표시)','license_confirmed':True,
    'file':'charger_info_clean.csv','snapshot_date':'2026-10-15',
    'region_system':'2026_16_provinces','source':'한국환경공단 getChargerInfo',
    'source_url':'https://www.data.go.kr/data/15076352/openapi.do','unit':'기 / 곳 / kW'}
GROWTH_SOURCE = {'provider':'무공해차 통합누리집','author':'원본 미기재',
    'dataset':'데이터·통계 「충전기 설치 성장 추세」 2011–2026 (2026년 부분 연도)',
    'reference_basis':'집계 마감일 원본 미기재, 당시 공식 화면 갱신 표시 2026-09-30',
    'official_update_label_at_collection':'2026-09-30','file_saved_date':'2026-10-15',
    'revision_note':'이 자료는 2026-10-15에 저장한 당시 표의 값이며 현재 공식 최신값이 아닙니다. '
        '공식 화면은 이후 2026-10-31 갱신에서 과거 연도 수치까지 수정했고, 수정 사유는 공식적으로 확인되지 않았습니다.',
    'license':'확인 중 (공개자료 목록의 이용 안내는 이 표 적용 미확인)','license_confirmed':False,
    'source_url':'https://ev.or.kr/nportal/stats/statsDashboard.do',
    'file':'charger_installation_trend.csv','source':'충전기 설치 성장 추세_2026-10-15.xlsx',
    'period':'2011–2026','source_filename_date':'2026-10-15','measurement_cutoff_date':None,
    'partial_year':2026,'unit':'기','geography':'전국 (지역 세분 없음)'}

# 좌표 품질 안내(reports/coordinate_quality_2026-11-13.md). 원본 좌표는 바꾸지 않고, 의심 근거가 있는
# 충전소 행에만 coordinate_flag를 붙이는 표시용 판정입니다. 실제 위치 오류를 확정하지 않습니다.
COORDINATE_FAR_KM = 100.0             # 주소 시군구 대표 좌표 중앙값에서 이보다 멀면 far_from_address
COORDINATE_SHARED_MIN_STATIONS = 3    # 같은 좌표를 이만큼 이상의 충전소가 공유하고
COORDINATE_SHARED_MIN_SGG = 2         # 그 충전소들의 주소 시군구가 이만큼 이상 다르면 placeholder
COORDINATE_KM_PER_DEG_LAT = 110.57
COORDINATE_KM_PER_DEG_LNG = 111.32*0.8090169943749475  # cos(36°)
COORDINATE_FLAGS = ('placeholder','far_from_address','placeholder_far_from_address')
COORDINATE_QUALITY_RULE = ('coordinate_flag는 원본 좌표 품질이 의심되는 충전소 행에만 붙습니다(실제 위치 오류 확정 아님). '
    'placeholder: 주소 시군구가 2개 이상 다른 충전소 3곳 이상이 같은 좌표를 공유하거나 위도·경도가 모두 소수 1자리 이하. '
    'far_from_address: 주소 시군구 충전소 대표 좌표 중앙값에서 100km 초과. 필터 없는 대표 좌표로 판정하며 좌표·건수·집계는 바꾸지 않습니다.')
# 주소 첫 단어(시도) 약칭 → 정식 명칭. 시군구 비교 전에 표기를 맞춥니다.
SIDO_ALIASES = {'서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시',
    '광주':'전남광주통합특별시','광주광역시':'전남광주통합특별시','전남':'전남광주통합특별시','전라남도':'전남광주통합특별시',
    '대전':'대전광역시','울산':'울산광역시','세종':'세종특별자치시','경기':'경기도',
    '강원':'강원특별자치도','강원도':'강원특별자치도','충북':'충청북도','충남':'충청남도',
    '전북':'전북특별자치도','전라북도':'전북특별자치도','경북':'경상북도','경남':'경상남도',
    '제주':'제주특별자치도','제주도':'제주특별자치도'}


def address_sgg(address):
    """'시도 시군구' from an address with the province spelling normalized ('' if empty)."""
    parts = str(address).split()
    return ' '.join([SIDO_ALIASES.get(parts[0],parts[0])]+parts[1:2]) if parts else ''


def coordinate_quality_flags(table):
    """{station_id: (flag, latitude, longitude)} for suspicious representative coordinates only.
    `table` is the unfiltered per-station representative table (DataStore.locations)."""
    if not len(table):
        return {}
    address = table.address.astype('category')
    # Parse each distinct address once (≈70k), not each station row.
    names = np.array([address_sgg(a) for a in address.cat.categories],dtype=object)
    sgg = pd.Series(names[address.cat.codes.to_numpy()],index=table.index)
    lat = table.latitude.to_numpy(dtype=float)
    lng = table.longitude.to_numpy(dtype=float)
    frame = pd.DataFrame({'sgg':sgg.to_numpy(),'lat':lat,'lng':lng,'lat6':lat.round(6),'lng6':lng.round(6)})
    shared = frame.groupby(['lat6','lng6'],sort=False).sgg.agg(['size','nunique'])
    shared = shared.loc[(shared['size']>=COORDINATE_SHARED_MIN_STATIONS)&(shared['nunique']>=COORDINATE_SHARED_MIN_SGG)]
    on_shared = pd.MultiIndex.from_arrays([frame.lat6,frame.lng6]).isin(shared.index)
    one_decimal = lambda v: np.abs(v*10-np.round(v*10))<1e-9
    placeholder = on_shared | (one_decimal(lat) & one_decimal(lng))
    median = frame.groupby('sgg',sort=False)[['lat','lng']].median().reindex(frame.sgg)
    km = np.hypot((lng-median.lng.to_numpy())*COORDINATE_KM_PER_DEG_LNG,(lat-median.lat.to_numpy())*COORDINATE_KM_PER_DEG_LAT)
    far = km>COORDINATE_FAR_KM
    ids = table.station_id.to_numpy()
    result = {}
    for i in np.flatnonzero(placeholder|far):
        flag = 'placeholder_far_from_address' if placeholder[i] and far[i] else 'placeholder' if placeholder[i] else 'far_from_address'
        result[str(ids[i])] = (flag,float(lat[i]),float(lng[i]))
    return result


def records(frame):
    """Standard JSON nulls, Unicode, and preserved string IDs; no NaN/Infinity."""
    return json.loads(frame.to_json(orient='records',force_ascii=False,double_precision=15))


class DataStore:
    """One immutable-in-use snapshot per process. A restart explicitly refreshes files."""
    def __init__(self, project_root, verify_counts=True):
        self.root = Path(project_root).resolve()
        directory = self.root/'data/processed'
        # Only columns that an API response, filter, validation or snapshot metadata uses.
        # stat/statUpdDt are never read; raw lat/lng text and _fetched_at are dropped
        # below once the numeric coordinates and snapshot times are derived from them.
        columns = ['statId','chgerId','statNm','chgerType','addr','lat','lng','zcode','delYn',
            'busiId','busiNm','output','_fetched_at']
        # Repeated IDs/text use shared dictionaries rather than one object array
        # per column. Keep numeric source text and timestamps unchanged.
        categorical = {'statId','chgerId','statNm','addr','chgerType','zcode',
                       'delYn','busiId','busiNm','output'}
        with open_snapshot(directory/'charger_info_clean.csv') as source:
            self.chargers = pd.read_csv(source,usecols=columns,
                dtype={col:'category' if col in categorical else str for col in columns},keep_default_na=False)
        for col in columns:
            normalized = self.chargers[col].str.strip()
            # Rebuild categories after normalization: whitespace variants may
            # merge, and lexicographic category order must match string sorting.
            self.chargers[col] = normalized.astype('category') if col in categorical else normalized
        self.chargers['_lat'] = pd.to_numeric(self.chargers.lat,errors='coerce')
        self.chargers['_lng'] = pd.to_numeric(self.chargers.lng,errors='coerce')
        self.chargers['_output_kw'] = pd.to_numeric(self.chargers.output,errors='coerce')
        self.ev = pd.read_csv(directory/EV_SOURCE['file'],dtype={'region_code':str},keep_default_na=False)
        # Additive compatibility for older clients; frontend uses the canonical keys.
        self.ev['region_code_2025']=self.ev.region_code
        self.ev['region_name_2025']=self.ev.region_name
        self.growth = pd.read_csv(directory/'charger_installation_trend.csv',keep_default_na=False)
        self.chart_metadata = json.loads((self.root/'reports/chart_verification.json').read_text(encoding='utf-8'))['charts']
        self.ev_regions = dict(zip(self.ev.region_code,self.ev.region_name))
        self.operator_ids = set(self.chargers.busiId)
        self.snapshot_start = self.chargers._fetched_at.min()
        self.snapshot_end = self.chargers._fetched_at.max()
        # Source text kept only to derive _lat/_lng and the snapshot window above.
        self.chargers.drop(columns=['lat','lng','_fetched_at'],inplace=True)
        if self.chargers[['statId','chgerId']].eq('').any().any() or self.chargers.duplicated(['statId','chgerId']).any():
            raise ValueError('충전기 식별자 결측/중복: 스냅샷 확인 필요')
        if not set(self.chargers.zcode) <= set(REGIONS_2026):
            raise ValueError('지원하지 않는 현재 지역코드')
        if set(self.chargers.delYn) - {'N','Y'}:
            raise ValueError('삭제 표시 값 확인 필요')
        if (set(self.ev.reference_month) != {EV_SOURCE['reference_month']}
                or self.ev.region_code.duplicated().any() or self.ev_regions != REGIONS_2026):
            raise ValueError('등록자료 기준월/지역키 확인 필요')
        self.baseline = self.counts(self.chargers)
        if verify_counts:
            expected = {'charger_count':527433,'station_count':101091,'not_deleted_charger_count':523312,'deleted_charger_count':4121}
            if any(self.baseline[k] != v for k,v in expected.items()) or int(self.ev.ev_registration_count.sum()) != 1191873:
                raise ValueError('기대한 2026-09 등록 / 2026-10-15 충전기 스냅샷 총수와 다릅니다.')

    @staticmethod
    def counts(frame):
        return {'charger_count':len(frame),'station_count':int(frame.statId.nunique()),
            'not_deleted_charger_count':int(frame.delYn.eq('N').sum()),
            'deleted_charger_count':int(frame.delYn.eq('Y').sum())}

    def select(self, filters):
        frame = self.chargers
        mask = None
        for parameter,column in [('region_code','zcode'),('charger_type','chgerType'),('operator_id','busiId')]:
            if filters.get(parameter) is not None:
                condition = frame[column].eq(filters[parameter])
                mask = condition if mask is None else mask & condition
        if filters['deletion'] != 'all':
            condition = frame.delYn.eq('N' if filters['deletion']=='not_deleted' else 'Y')
            mask = condition if mask is None else mask & condition
        # Callers only read this snapshot; derived columns belong to new frames.
        return frame if mask is None else frame.loc[mask]

    def grouped(self, frame, columns):
        group_columns = [columns] if isinstance(columns,str) else columns
        subset = frame[list(dict.fromkeys(group_columns+['chgerId','statId','delYn']))].assign(
            _not_deleted=frame.delYn.eq('N'),_deleted=frame.delYn.eq('Y'))
        result = subset.groupby(group_columns,dropna=False,sort=True,observed=True).agg(
            charger_count=('chgerId','size'),station_count=('statId','nunique'),
            not_deleted_charger_count=('_not_deleted','sum'),
            deleted_charger_count=('_deleted','sum')).reset_index()
        total = len(frame)
        # Routes can map/fill these keys with values outside a category dictionary.
        for col in group_columns:
            result[col] = result[col].astype(object)
        result['share_pct'] = result.charger_count/total*100 if total else None
        return result

    def regional_disparity(self, filters):
        """Aggregate regional infrastructure metrics in one pass per metric family.

        Region selection is deliberately ignored: the comparison population is always
        the 16-region system. Deletion selection applies to all metrics except the
        deletion share, whose numerator and denominator require both Y and N rows.
        """
        base_filters = {**filters, 'region_code': None}
        frame = self.select(base_filters)
        deletion_frame = self.select({**base_filters, 'deletion': 'all'})
        output = frame.assign(_valid=frame._output_kw.gt(0), _high=frame._output_kw.ge(100))
        by_region = output.groupby('zcode', observed=True, sort=True).agg(
            charger_count=('chgerId', 'size'), station_count=('statId', 'nunique'),
            valid_output_count=('_valid', 'sum'), high_output_count=('_high', 'sum'))
        # Operator counts are retained at operator ID/name granularity, matching /api/operators.
        operator = frame.groupby(['zcode', 'busiId', 'busiNm'], observed=True, sort=True).chgerId.size()
        operator_totals = frame.groupby(['busiId', 'busiNm'], observed=True, sort=True).chgerId.size()
        types = frame.groupby(['zcode', 'chgerType'], observed=True, sort=True).chgerId.size()
        deleted = deletion_frame.groupby('zcode', observed=True, sort=True).delYn.agg(
            total='size', deleted=lambda values: int(values.eq('Y').sum()))
        def hhi(counts):
            total = int(counts.sum())
            return (sum((int(v) / total) ** 2 for v in counts) * 10000) if total else None
        national_output = int(by_region.high_output_count.sum()) / int(by_region.valid_output_count.sum()) * 100 if int(by_region.valid_output_count.sum()) else None
        national_chargers = int(by_region.charger_count.sum())
        national_stations = int(frame.statId.nunique())
        national_types = frame.groupby('chgerType', observed=True).chgerId.size()
        # Empty categorical aggregations do not support Series.sum() on some
        # pandas versions. Count their integer values explicitly for 0-row filters.
        national_deleted_total = sum(int(value) for value in deleted.total)
        national_deleted = sum(int(value) for value in deleted.deleted)
        national_operator_hhi = hhi(operator_totals)
        rows = []
        for code, name in REGIONS_2026.items():
            charger_n = int(by_region.loc[code, 'charger_count']) if code in by_region.index else 0
            station_n = int(by_region.loc[code, 'station_count']) if code in by_region.index else 0
            valid_n = int(by_region.loc[code, 'valid_output_count']) if code in by_region.index else 0
            high_n = int(by_region.loc[code, 'high_output_count']) if code in by_region.index else 0
            type_counts = types.loc[code] if code in types.index.get_level_values(0) else pd.Series(dtype='int64')
            region_operators = operator.loc[code] if code in operator.index.get_level_values(0) else pd.Series(dtype='int64')
            del_total = int(deleted.loc[code, 'total']) if code in deleted.index else 0
            del_n = int(deleted.loc[code, 'deleted']) if code in deleted.index else 0
            metrics = {
                'high_100kw': {'numerator': high_n, 'denominator': valid_n, 'value_pct': high_n / valid_n * 100 if valid_n else None},
                'chargers_per_station': {'numerator': charger_n, 'denominator': station_n, 'value': charger_n / station_n if station_n else None},
                'type_mix': [{'charger_type_code': str(t), 'charger_count': int(v), 'denominator': charger_n,
                              'value_pct': int(v) / charger_n * 100 if charger_n else None} for t, v in type_counts.items()],
                'operator_hhi': {'value': hhi(region_operators), 'scale': '0-10000', 'operator_count': int(len(region_operators))},
                'deletion_share': {'numerator': del_n, 'denominator': del_total, 'value_pct': del_n / del_total * 100 if del_total else None},
            }
            rows.append({'region_code': code, 'region_name': name, 'charger_count': charger_n,
                         'station_count': station_n, 'metrics': metrics})
        nat_types = [{'charger_type_code': str(t), 'charger_count': int(v), 'denominator': national_chargers,
                      'value_pct': int(v) / national_chargers * 100 if national_chargers else None} for t, v in national_types.items()]
        national = {
            'high_100kw': {'numerator': int(by_region.high_output_count.sum()), 'denominator': int(by_region.valid_output_count.sum()), 'value_pct': national_output},
            'chargers_per_station': {'numerator': national_chargers, 'denominator': national_stations, 'value': national_chargers / national_stations if national_stations else None},
            'type_mix': nat_types,
            'operator_hhi': {'value': national_operator_hhi, 'scale': '0-10000', 'operator_count': int(len(operator_totals))},
            'deletion_share': {'numerator': national_deleted, 'denominator': national_deleted_total,
                               'value_pct': national_deleted / national_deleted_total * 100 if national_deleted_total else None},
        }
        value_keys = ['high_100kw', 'chargers_per_station', 'operator_hhi', 'deletion_share']
        for key in value_keys:
            field = 'value' if key in {'chargers_per_station', 'operator_hhi'} else 'value_pct'
            vals = [(row['region_code'], row['metrics'][key][field]) for row in rows if row['metrics'][key][field] is not None]
            vals.sort(key=lambda item: (-item[1], item[0]))
            previous = object(); rank = 0
            for index, (code, value) in enumerate(vals, start=1):
                if value != previous: rank = index
                next(row for row in rows if row['region_code'] == code)['metrics'][key]['rank'] = rank
                previous = value
        # Add region ranks for each connector type; absent observations are zero shares.
        all_types = sorted({item['charger_type_code'] for row in rows for item in row['metrics']['type_mix']})
        for row in rows:
            if not row['charger_count']:
                continue  # No denominator: keep the share null and exclude the region from ranking.
            observed = {item['charger_type_code'] for item in row['metrics']['type_mix']}
            for type_code in all_types:
                if type_code not in observed:
                    row['metrics']['type_mix'].append({
                        'charger_type_code': type_code, 'charger_count': 0,
                        'denominator': row['charger_count'], 'value_pct': 0.0})
            row['metrics']['type_mix'].sort(key=lambda item: item['charger_type_code'])
        for type_code in all_types:
            values = []
            for row in rows:
                item = next((x for x in row['metrics']['type_mix'] if x['charger_type_code'] == type_code), None)
                values.append((row, item['value_pct'] if item else (0 if row['charger_count'] else None)))
            ranked = sorted(((r, v) for r, v in values if v is not None), key=lambda x: (-x[1], x[0]['region_code']))
            prev = object(); rank = 0
            for i, (row, value) in enumerate(ranked, 1):
                if value != prev: rank = i
                item = next((x for x in row['metrics']['type_mix'] if x['charger_type_code'] == type_code), None)
                if item: item['rank'] = rank
                prev = value
        return rows, national, frame, deletion_frame

    def output_by_region(self, filters):
        """Every region's /api/charger-output result in one pass (Regional Explorer heatmap).

        Region selection is ignored: the 16 regions are always returned, like the heatmap's former
        16 requests (non-region filters + region_code=each). One selection and one (region, output)
        group-by replace 16 selections; per-region totals and output statistics are group-bys over
        the needed columns only (no per-region frame copies). Each region's rows, matched counts,
        count and output_statistics equal that region's /api/charger-output response
        (backend/tests/test_charger_output_regions.py).
        """
        base = {**filters, 'region_code': None}
        frame = self.select(base)
        grouped = self.grouped(frame, ['zcode', 'output']).rename(columns={'output': 'output_raw'})
        # Share within the region: same arithmetic as the per-region request (count / regional total * 100).
        grouped['share_pct'] = grouped.charger_count / grouped.groupby('zcode', sort=False).charger_count.transform('sum') * 100
        grouped['output_kw'] = pd.to_numeric(grouped.output_raw, errors='coerce')
        grouped['value_status'] = 'positive_numeric'
        grouped.loc[grouped.output_kw.le(0), 'value_status'] = 'nonpositive'
        grouped.loc[grouped.output_kw.isna(), 'value_status'] = 'nonnumeric'
        grouped.loc[grouped.output_raw.eq(''), 'value_status'] = 'missing'
        # Per-region order of the single request: output_kw, then output_raw, missing last (stable).
        grouped = grouped.sort_values(['zcode', 'output_kw', 'output_raw'], na_position='last', kind='stable')
        columns = ['output_raw', 'charger_count', 'station_count', 'not_deleted_charger_count',
                   'deleted_charger_count', 'share_pct', 'output_kw', 'value_status']
        parts = {code: part[columns] for code, part in grouped.groupby('zcode', sort=False, observed=True)}
        totals = self.grouped(frame, 'zcode').set_index('zcode')
        positive = frame.loc[frame._output_kw.gt(0), ['zcode', '_output_kw']]
        stats = positive.groupby('zcode', observed=True)._output_kw.agg(['size', 'median', 'min', 'max'])
        regions = []
        for code in REGIONS_2026:
            part = parts.get(code)
            row = totals.loc[code] if code in totals.index else None
            total = int(row.charger_count) if row is not None else 0
            valid = int(stats.loc[code, 'size']) if code in stats.index else 0
            regions.append({
                'region_code': code,
                'data': records(part) if part is not None else [],
                'filters': {**base, 'region_code': code},
                'matched': {'charger_count': total,
                            'station_count': int(row.station_count) if row is not None else 0,
                            'not_deleted_charger_count': int(row.not_deleted_charger_count) if row is not None else 0,
                            'deleted_charger_count': int(row.deleted_charger_count) if row is not None else 0},
                'count': len(part) if part is not None else 0,
                'output_statistics': {
                    'valid_positive_count': valid, 'invalid_or_missing_count': total - valid,
                    'median_kw': float(stats.loc[code, 'median']) if valid else None,
                    'min_kw': float(stats.loc[code, 'min']) if valid else None,
                    'max_kw': float(stats.loc[code, 'max']) if valid else None}})
        return regions, frame

    def filter_options(self):
        return {'charger_regions':[{'code':k,'name':v} for k,v in REGIONS_2026.items()],
            'ev_regions':[{'code':k,'name':v} for k,v in self.ev_regions.items()],
            'charger_types':[{'code':k,'name':v,'observed_charger_count':int(self.chargers.chgerType.eq(k).sum())} for k,v in TYPE_DEFINITIONS.items()],
            'deletion':['all','not_deleted','deleted']}

    @staticmethod
    def station_size_distribution(frame):
        """Filter first; one observation per (region, station), unique charger IDs."""
        sizes = frame.groupby(['zcode','statId'],sort=True,observed=True).chgerId.nunique()
        rows = []
        for region, values in sizes.groupby(level='zcode',sort=True,observed=True):
            q1, median, q3 = (float(v) for v in values.quantile([.25,.5,.75],interpolation='linear'))
            iqr = q3-q1
            low, high = q1-1.5*iqr, q3+1.5*iqr
            inside = values.loc[values.between(low,high)]
            outside = values.loc[~values.between(low,high)]
            rows.append({'region_code':region,'region_name':REGIONS_2026[region],
                'station_count':len(values),'sample_count':len(values),'charger_count':int(values.sum()),
                'min':int(values.min()),'q1':q1,'median':median,'q3':q3,'max':int(values.max()),
                'mean':float(values.mean()),'iqr':iqr,'fence_low':low,'fence_high':high,
                'whisker_low':int(inside.min()),'whisker_high':int(inside.max()),
                'outlier_count':len(outside),'outlier_distribution':[
                    {'charger_count':int(value),'station_count':int(count)}
                    for value,count in outside.value_counts().sort_index().items()]})
        return rows

    def locations(self, frame):
        valid = frame._lat.between(33,39.5)&frame._lng.between(124,132)
        # Sort only dictionary-encoded selection keys, then fetch response fields
        # for one representative per station. Never copy/sort all 18 columns.
        keys = frame.loc[valid,['statId','delYn','chgerId']]
        representative_index = keys.sort_values(['delYn','chgerId'],kind='stable').drop_duplicates('statId').index
        preferred = frame.loc[representative_index,['statId','statNm','addr','zcode','_lat','_lng']].copy()
        preferred['statId'] = preferred.statId.astype(object)
        preferred = preferred.set_index('statId')
        # All matching chargers count, including invalid-coordinate siblings.
        totals = self.grouped(frame,'statId').set_index('statId')
        selected = preferred[['statNm','addr','zcode','_lat','_lng']].join(totals)
        selected = selected.reset_index().rename(columns={'statId':'station_id','statNm':'station_name',
            'addr':'address','zcode':'region_code','_lat':'latitude','_lng':'longitude'})
        selected['region_name'] = selected.region_code.map(REGIONS_2026)
        selected = selected.drop(columns='share_pct')
        return selected.sort_values('station_id',kind='stable'), int((~valid).sum())

    def coordinate_flags(self, unfiltered_table=None):
        """Coordinate-quality flags, computed once per process on first use (not at startup,
        to keep cold starts short) from the unfiltered representative table and then reused.
        Pass that table when the caller already has it; otherwise it is built here and dropped."""
        flags = getattr(self,'_coordinate_flags',None)
        if flags is None:
            table = unfiltered_table if unfiltered_table is not None else self.locations(self.chargers)[0]
            flags = self._coordinate_flags = coordinate_quality_flags(table[['station_id','address','latitude','longitude']])
        return flags

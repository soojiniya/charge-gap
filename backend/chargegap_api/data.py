from __future__ import annotations

from pathlib import Path
import json
import pandas as pd

REGIONS_2026 = dict(zip('11 12 26 27 28 30 31 36 41 43 44 47 48 50 51 52'.split(),
    '서울 전남광주통합특별시 부산 대구 인천 대전 울산 세종 경기 충북 충남 경북 경남 제주 강원 전북'.split()))
TYPE_DEFINITIONS = {'01':'DC차데모','02':'AC완속','03':'DC차데모+AC3상','04':'DC콤보',
    '05':'DC차데모+DC콤보','06':'DC차데모+AC3상+DC콤보','07':'AC3상','08':'DC콤보(완속)',
    '09':'NACS','10':'DC콤보+NACS','11':'DC콤보2(버스전용)'}
COMMON_PARAMETERS = {'region_code','charger_type','deletion','operator_id'}
UNITS = {'ev_registration_count':'대','charger_count':'기','station_count':'곳','output_kw':'kW','share_pct':'%'}
WARNINGS = [
    '전기차 등록은 2025-12, 충전기 API는 2026-10-15 조회 자료입니다. 서로 다른 시점입니다.',
    '비삭제 표시(delYn=N)는 실제 이용 가능 상태를 뜻하지 않습니다.',
    'statUpdDt는 상태 갱신일시이며 설치일이 아닙니다.',
    '전남광주통합특별시(12)를 과거 광주(29)·전남(46)으로 분할하지 않습니다.',
]
EV_SOURCE = {'file':'ev_registration_by_region_2025.csv','reference_month':'2025-12',
    'region_system':'2025_17_provinces','source':'2025년 12월 자동차 등록자료 / 10.연료별_등록현황',
    'unit':'대','fuel':'전기 (하이브리드·수소전기 제외)'}
API_SOURCE = {'file':'charger_info_clean.csv','snapshot_date':'2026-10-15',
    'region_system':'2026_16_provinces','source':'한국환경공단 getChargerInfo',
    'source_url':'https://www.data.go.kr/data/15076352/openapi.do','unit':'기 / 곳 / kW'}
GROWTH_SOURCE = {'file':'charger_installation_trend.csv','source':'충전기 설치 성장 추세_2026-10-15.xlsx',
    'period':'2011–2026','source_filename_date':'2026-10-15','measurement_cutoff_date':None,
    'partial_year':2026,'unit':'기','geography':'전국 (지역 세분 없음)'}


def records(frame):
    """Standard JSON nulls, Unicode, and preserved string IDs; no NaN/Infinity."""
    return json.loads(frame.to_json(orient='records',force_ascii=False,double_precision=15))


class DataStore:
    """One immutable-in-use snapshot per process. A restart explicitly refreshes files."""
    def __init__(self, project_root, verify_counts=True):
        self.root = Path(project_root).resolve()
        directory = self.root/'data/processed'
        columns = ['statId','chgerId','statNm','chgerType','addr','lat','lng','zcode','delYn',
            'busiId','busiNm','stat','statUpdDt','output','_fetched_at']
        self.chargers = pd.read_csv(directory/'charger_info_clean.csv',usecols=columns,dtype=str,keep_default_na=False)
        for col in columns:
            self.chargers[col] = self.chargers[col].str.strip()
        self.chargers['_lat'] = pd.to_numeric(self.chargers.lat,errors='coerce')
        self.chargers['_lng'] = pd.to_numeric(self.chargers.lng,errors='coerce')
        self.chargers['_output_kw'] = pd.to_numeric(self.chargers.output,errors='coerce')
        self.ev = pd.read_csv(directory/'ev_registration_by_region_2025.csv',dtype={'region_code_2025':str},keep_default_na=False)
        self.growth = pd.read_csv(directory/'charger_installation_trend.csv',keep_default_na=False)
        self.chart_metadata = json.loads((self.root/'reports/chart_verification.json').read_text(encoding='utf-8'))['charts']
        self.ev_regions = dict(zip(self.ev.region_code_2025,self.ev.region_name_2025))
        self.operator_ids = set(self.chargers.busiId)
        self.snapshot_start = self.chargers._fetched_at.min()
        self.snapshot_end = self.chargers._fetched_at.max()
        if self.chargers[['statId','chgerId']].eq('').any().any() or self.chargers.duplicated(['statId','chgerId']).any():
            raise ValueError('충전기 식별자 결측/중복: 스냅샷 확인 필요')
        if not set(self.chargers.zcode) <= set(REGIONS_2026):
            raise ValueError('지원하지 않는 현재 지역코드')
        if set(self.chargers.delYn) - {'N','Y'}:
            raise ValueError('삭제 표시 값 확인 필요')
        if set(self.ev.reference_month) != {'2025-12'} or self.ev.region_code_2025.duplicated().any():
            raise ValueError('등록자료 기준월/지역키 확인 필요')
        self.baseline = self.counts(self.chargers)
        if verify_counts:
            expected = {'charger_count':527433,'station_count':101091,'not_deleted_charger_count':523312,'deleted_charger_count':4121}
            if any(self.baseline[k] != v for k,v in expected.items()) or int(self.ev.ev_registration_count.sum()) != 899101:
                raise ValueError('기대한 2025/2026 스냅샷 총수와 다릅니다. 새 기준일을 명시적으로 구성하세요.')

    @staticmethod
    def counts(frame):
        return {'charger_count':len(frame),'station_count':int(frame.statId.nunique()),
            'not_deleted_charger_count':int(frame.delYn.eq('N').sum()),
            'deleted_charger_count':int(frame.delYn.eq('Y').sum())}

    def select(self, filters):
        frame = self.chargers
        mask = pd.Series(True,index=frame.index)
        for parameter,column in [('region_code','zcode'),('charger_type','chgerType'),('operator_id','busiId')]:
            if filters.get(parameter) is not None:
                mask &= frame[column].eq(filters[parameter])
        if filters['deletion'] != 'all':
            mask &= frame.delYn.eq('N' if filters['deletion']=='not_deleted' else 'Y')
        return frame.loc[mask]

    def grouped(self, frame, columns):
        group_columns = [columns] if isinstance(columns,str) else columns
        subset = frame[list(dict.fromkeys(group_columns+['chgerId','statId','delYn']))].assign(
            _not_deleted=frame.delYn.eq('N').astype('int64'),_deleted=frame.delYn.eq('Y').astype('int64'))
        result = subset.groupby(group_columns,dropna=False,sort=True).agg(
            charger_count=('chgerId','size'),station_count=('statId','nunique'),
            not_deleted_charger_count=('_not_deleted','sum'),
            deleted_charger_count=('_deleted','sum')).reset_index()
        total = len(frame)
        result['share_pct'] = result.charger_count/total*100 if total else None
        return result

    def filter_options(self):
        return {'charger_regions':[{'code':k,'name':v} for k,v in REGIONS_2026.items()],
            'ev_regions':[{'code':k,'name':v} for k,v in self.ev_regions.items()],
            'charger_types':[{'code':k,'name':v,'observed_charger_count':int(self.chargers.chgerType.eq(k).sum())} for k,v in TYPE_DEFINITIONS.items()],
            'deletion':['all','not_deleted','deleted']}

    @staticmethod
    def station_size_distribution(frame):
        """Filter first; one observation per (region, station), unique charger IDs."""
        sizes = frame.groupby(['zcode','statId'],sort=True).chgerId.nunique()
        rows = []
        for region, values in sizes.groupby(level='zcode',sort=True):
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
        valid_frame = frame.loc[valid]
        # All matching chargers count, including invalid-coordinate siblings.
        totals = self.grouped(frame,'statId').set_index('statId')
        preferred = valid_frame.sort_values(['delYn','chgerId'],kind='stable').drop_duplicates('statId').set_index('statId')
        selected = preferred[['statNm','addr','zcode','_lat','_lng']].join(totals)
        selected = selected.reset_index().rename(columns={'statId':'station_id','statNm':'station_name',
            'addr':'address','zcode':'region_code','_lat':'latitude','_lng':'longitude'})
        selected['region_name'] = selected.region_code.map(REGIONS_2026)
        selected = selected.drop(columns='share_pct')
        return selected.sort_values('station_id',kind='stable'), int((~valid).sum())

from copy import deepcopy
import math
from pathlib import Path
from flask import Blueprint, jsonify, request, send_file
import pandas as pd
from .data import COMMON_PARAMETERS, EV_SOURCE, API_SOURCE, GROWTH_SOURCE, UNITS, WARNINGS, REGIONS_2026, TYPE_DEFINITIONS, records
from .validation import APIError, allowed_parameters, bounding_box, charger_filters, choice, integer


def create_blueprint(store):
    bp=Blueprint('api',__name__,url_prefix='/api')

    def reply(data,sources,filters=None,frame=None,extra=None):
        sources=deepcopy(sources)
        if 'chargers' in sources:
            sources['chargers'].update(snapshot_start_at=store.snapshot_start,snapshot_end_at=store.snapshot_end)
        meta={'api_version':'1.0','sources':sources,'units':UNITS,'filters':filters or {},
            'warnings':WARNINGS,'same_period_shortage_rate_computed':False,
            'snapshot_policy':'프로세스 시작 시 CSV를 읽은 고정 스냅샷. 갱신은 서버 재시작으로 반영.'}
        if frame is not None:meta['matched']=store.counts(frame)
        if extra:meta.update(extra)
        return jsonify({'data':data,'meta':meta})

    def charger_request(extra=()):
        allowed_parameters(COMMON_PARAMETERS|set(extra))
        filters=charger_filters(store)
        return filters,store.select(filters)

    def paginated(data,page,limit):
        total=len(data);start=(page-1)*limit
        return records(data.iloc[start:start+limit]),{'page':page,'limit':limit,'total_items':total,
            'total_pages':math.ceil(total/limit),'has_next':start+limit<total,
            'next_page':page+1 if start+limit<total else None}

    @bp.get('/overview')
    def overview():
        filters,frame=charger_request({'ev_region_code'})
        ev_region=choice('ev_region_code',store.ev_regions)
        ev=store.ev if ev_region is None else store.ev.loc[store.ev.region_code_2025.eq(ev_region)]
        count=store.counts(frame)
        return reply({'ev_registration':{'ev_registration_count':int(ev.ev_registration_count.sum()),
            'region_count':len(ev),'reference_month':'2025-12'},
            'chargers':count,'national_snapshot_totals':{'ev_registration_count':int(store.ev.ev_registration_count.sum()),**store.baseline}},
            {'ev_registration':EV_SOURCE,'chargers':API_SOURCE},
            {**filters,'ev_region_code':ev_region},frame,
            {'filter_scopes':{'region_code':'chargers_only','charger_type':'chargers_only',
                'deletion':'chargers_only','operator_id':'chargers_only','ev_region_code':'ev_registration_only'},
             'filter_options':store.filter_options()})

    @bp.get('/ev-registration')
    def ev_registration():
        allowed_parameters({'region_code'})
        region=choice('region_code',store.ev_regions)
        frame=store.ev if region is None else store.ev.loc[store.ev.region_code_2025.eq(region)]
        columns=['reference_month','region_system','region_code_2025','region_name_2025','ev_registration_count',
            'ev_passenger_count','ev_bus_count','ev_truck_count','ev_special_count','ev_noncommercial_count','ev_commercial_count']
        return reply(records(frame[columns]),{'ev_registration':EV_SOURCE},{'region_code':region},
            extra={'totals':{'ev_registration_count':int(frame.ev_registration_count.sum())},'count':len(frame)})

    @bp.get('/charger-regions')
    def charger_regions():
        filters,frame=charger_request()
        result=store.grouped(frame,'zcode').rename(columns={'zcode':'region_code'})
        result['region_name']=result.region_code.map(REGIONS_2026)
        return reply(records(result),{'chargers':API_SOURCE},filters,frame,
            {'count':len(result),'station_count_additivity':'각 지역 안의 고유 충전소 수. 분류별 충전소 수는 중복 가능성이 있어 전국 값은 matched.station_count를 사용하세요.'})

    @bp.get('/station-size-distribution')
    def station_size_distribution():
        filters,frame=charger_request()
        rows=store.station_size_distribution(frame)
        return reply(rows,{'chargers':API_SOURCE},filters,frame,{
            'count':len(rows),'sample_count':sum(row['sample_count'] for row in rows),
            'quantile_method':'linear','whisker_iqr_multiplier':1.5,
            'whisker_rule':'Observed minimum/maximum within inclusive [Q1 - 1.5*IQR, Q3 + 1.5*IQR]; outliers strictly outside.',
            'sample_unit':'One (zcode, statId) after filters; count distinct chgerId within that station.',
            'deletion_policy':'all includes N and Y; not_deleted includes N; deleted includes Y. Filter before station aggregation. N does not imply availability.',
            'empty_policy':'Only regions with observations appear; no observations returns data=[] and sample_count=0.',
            'station_count_additivity':'Regional samples use (zcode, statId); national matched.station_count uses distinct statId.'})

    @bp.get('/charger-types')
    def charger_types():
        filters,frame=charger_request()
        result=store.grouped(frame,'chgerType').rename(columns={'chgerType':'charger_type_code'})
        result['official_definition']=result.charger_type_code.map(TYPE_DEFINITIONS).fillna('공식 정의 미확인')
        result['definition_verified']=result.charger_type_code.isin(TYPE_DEFINITIONS)
        return reply(records(result),{'chargers':API_SOURCE},filters,frame,
            {'count':len(result),'definition_source':'한국환경공단 활용가이드 v1.25 §3.3',
             'classification_note':'커넥터 유형을 출력/급속 분류로 임의 변환하지 않습니다. 관측 0건인 유형은 data에 나타나지 않습니다.'})

    @bp.get('/charger-output')
    def charger_output():
        filters,frame=charger_request()
        result=store.grouped(frame,'output').rename(columns={'output':'output_raw'})
        result['output_kw']=pd.to_numeric(result.output_raw,errors='coerce')
        result['value_status']='positive_numeric'
        result.loc[result.output_kw.le(0),'value_status']='nonpositive'
        result.loc[result.output_kw.isna(),'value_status']='nonnumeric'
        result.loc[result.output_raw.eq(''),'value_status']='missing'
        result=result.sort_values(['output_kw','output_raw'],na_position='last',kind='stable')
        values=frame.loc[frame._output_kw.gt(0),'_output_kw']
        stats={'valid_positive_count':len(values),'invalid_or_missing_count':len(frame)-len(values),
            'median_kw':float(values.median()) if len(values) else None,
            'min_kw':float(values.min()) if len(values) else None,'max_kw':float(values.max()) if len(values) else None}
        return reply(records(result),{'chargers':API_SOURCE},filters,frame,{'count':len(result),'output_statistics':stats,
            'output_note':'output(kW)을 수치화했습니다. powerType은 전체 결측이며 실제 동시 공급전력/실측 충전속도를 뜻하지 않습니다.'})

    @bp.get('/operators')
    def operators():
        filters,frame=charger_request({'page','limit'})
        page=integer('page',1,1,1000000);limit=integer('limit',50,1,200)
        result=store.grouped(frame,['busiId','busiNm']).rename(columns={'busiId':'operator_id','busiNm':'operator_name'})
        result=result.sort_values(['charger_count','operator_id','operator_name'],ascending=[False,True,True],kind='stable')
        data,pagination=paginated(result,page,limit)
        return reply(data,{'chargers':API_SOURCE},filters,frame,{'pagination':pagination,
            'grouping':'앞뒤 공백을 정리한 (busiId,busiNm) 조합. 다른 명칭은 자동 통합하지 않습니다.',
            'station_count_additivity':'운영기관별 고유 충전소 수를 합산하면 같은 충전소가 중복될 수 있습니다.'})

    @bp.get('/growth')
    def growth():
        allowed_parameters({'year_from','year_to'})
        low=int(store.growth.year.min());high=int(store.growth.year.max())
        first=integer('year_from',low,low,high);last=integer('year_to',high,low,high)
        if first>last:raise APIError('시작 연도는 종료 연도보다 클 수 없습니다.','year_from')
        frame=store.growth.loc[store.growth.year.between(first,last)]
        columns=['year','annual_installed_count','cumulative_count','completed_calendar_year']
        data=records(frame[columns])
        for row in data:row.update(is_partial_year=not row['completed_calendar_year'],measurement_cutoff_date=None)
        return reply(data,{'growth':GROWTH_SOURCE},{'year_from':first,'year_to':last},extra={'count':len(data),
            'growth_warning':'2026년은 부분 연도이며 정확한 집계 마감일 미기재. API 현황과 모집단이 달라 합치거나 과거 API 재고로 간주하지 않습니다.'})

    @bp.get('/locations')
    def locations():
        filters,frame=charger_request({'page','limit','bbox'})
        page=integer('page',1,1,1000000);limit=integer('limit',200,1,1000);bbox=bounding_box()
        result,invalid_rows=store.locations(frame)
        excluded_stations=int(frame.statId.nunique())-len(result)
        if bbox:
            west,south,east,north=bbox
            result=result.loc[result.longitude.between(west,east)&result.latitude.between(south,north)]
        matched={'charger_count':int(result.charger_count.sum()),'station_count':len(result),
            'not_deleted_charger_count':int(result.not_deleted_charger_count.sum()),
            'deleted_charger_count':int(result.deleted_charger_count.sum())}
        data,pagination=paginated(result,page,limit)
        return reply(data,{'chargers':API_SOURCE},{**filters,'bbox':bbox},
            extra={'matched':matched,'pagination':pagination,'coordinate_reference_system':'WGS84 geographic latitude/longitude',
            'invalid_coordinate_rows_excluded_from_representative_selection':invalid_rows,
            'stations_without_valid_coordinates_excluded':excluded_stations,
            'representative_coordinate_rule':'충전기 필터 적용 → statId별 N 우선/충전기 ID 순 첫 유효 좌표 → 대표 좌표에 bbox → statId 순 페이지네이션. 각 행의 건수는 해당 충전소의 필터 일치 충전기 수입니다.'})

    def chart_record(item):
        return {'id':item['number'],'filename':item['file'],'title':item['purpose'],'chart_type':item['kind'],
            'purpose':item['purpose'],'data':item['data'],'reason':item['reason'],'results':item['results'],
            'caution':item['caution'],'period':item['period'],'metrics':item['metrics'],
            'image_pixels':item['image_pixels'],'dpi':item['dpi'],'sha256':item['sha256'],
            'image_url':f"/api/charts/{item['number']}/image",'filters_apply':False}

    @bp.get('/charts')
    def charts():
        allowed_parameters({'chart_id'})
        chart_id=integer('chart_id',1,1,10) if 'chart_id' in request.args else None
        rows=[chart_record(i) for i in store.chart_metadata if chart_id is None or i['number']==chart_id]
        return reply(rows,{'chart_metadata':{'file':'chart_verification.json','source':'기존 검증된 그래프 메타데이터','reference':'각 그래프 period 필드 참조'}},
            {'chart_id':chart_id},extra={'count':len(rows),'static_chart_warning':'PNG는 제작 당시의 고정 그래프이며 API 필터로 다시 생성하지 않습니다.'})

    @bp.get('/charts/<int:chart_id>/image')
    def chart_image(chart_id):
        allowed_parameters(set())
        item=next((i for i in store.chart_metadata if i['number']==chart_id),None)
        if item is None:raise APIError('그래프를 찾을 수 없습니다.',status=404,code='NOT_FOUND')
        directory=(store.root/'outputs/charts').resolve()
        path=(directory/item['file']).resolve()
        if path.parent!=directory or not path.is_file():
            raise APIError('그래프 파일을 제공할 수 없습니다.',status=503,code='DATA_UNAVAILABLE')
        return send_file(path,mimetype='image/png',conditional=True,max_age=3600)

    return bp

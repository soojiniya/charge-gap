from copy import deepcopy
from functools import wraps
import math
from pathlib import Path
from flask import Blueprint, current_app, jsonify, request, send_file
import numpy as np
import pandas as pd
from .cache import ByteLRU, request_key
from .data import COMMON_PARAMETERS, EV_SOURCE, API_SOURCE, GROWTH_SOURCE, UNITS, WARNINGS, REGIONS_2026, TYPE_DEFINITIONS, COORDINATE_QUALITY_RULE, records
from .validation import APIError, allowed_parameters, bounding_box, charger_filters, choice, integer


# Rough per-entry bookkeeping (key tuple, dict slot, bytes object header) added to body size.
RESPONSE_ENTRY_OVERHEAD=512
# pandas' deep memory estimate under-counts object columns by up to ~25% in practice
# (measured RSS); budget conservatively so the 48 MiB limit holds for real memory.
TABLE_SAFETY_FACTOR=1.3
TABLE_ENTRY_OVERHEAD=64*1024

# /api/locations/grid: map cluster grid (zoom 11–15). One cell is GRID_CELL_PX screen pixels
# of the Kakao map at that zoom (level = 20 − zoom, 2^(level−3) m/px), i.e. half the
# client's 64px cluster cell, so the client merges neighbouring cells exactly as before.
GRID_CELL_PX=32
GRID_MIN_ZOOM=11
GRID_MAX_ZOOM=15
# Upper bound on cells the requested bbox may span (≈ 4K screen at zoom 11 needs ~10k).
GRID_MAX_CELLS=40000
METERS_PER_DEGREE_LAT=111320.0
# Fixed reference latitude (central Korea) so cell edges never depend on the bbox.
GRID_REFERENCE_COS=math.cos(math.radians(36.0))


def grid_cell_degrees(zoom):
    """Cell size (lat°, lng°) for a map zoom; a fixed global grid per zoom."""
    meters=GRID_CELL_PX*2.0**(17-zoom)
    return meters/METERS_PER_DEGREE_LAT,meters/(METERS_PER_DEGREE_LAT*GRID_REFERENCE_COS),meters


def table_bytes(frame,shared_dictionaries):
    """Approximate memory a cached table adds. Category dictionaries that are the very
    same objects as the snapshot's (station names, addresses...) are shared, not copied."""
    total=int(frame.memory_usage(index=True,deep=True).sum())
    for column in frame.select_dtypes('category'):
        categories=frame[column].cat.categories
        if id(categories) in shared_dictionaries:
            total-=int(categories.memory_usage(deep=True))
    return int(total*TABLE_SAFETY_FACTOR)+TABLE_ENTRY_OVERHEAD


def create_blueprint(store,response_cache=None,locations_cache=None):
    bp=Blueprint('api',__name__,url_prefix='/api')
    response_cache=response_cache or ByteLRU(0,'responses')
    locations_cache=locations_cache or ByteLRU(0,'locations')
    # The snapshot is immutable for the process lifetime, so these objects (and ids) stay alive.
    shared_dictionaries={id(store.chargers[c].cat.categories) for c in store.chargers.select_dtypes('category')}

    def cached(view):
        """Reuse the exact JSON body of a successful GET for an identical request.
        Errors (raised before a response exists) and non-200 responses are never stored.
        Per-request headers such as CORS are added afterwards by the app, never cached."""
        @wraps(view)
        def wrapper(*args,**kwargs):
            if not response_cache.enabled:
                return view(*args,**kwargs)
            key=request_key(request.path,request.args)
            body=response_cache.get(key)
            if body is not None:
                return current_app.response_class(body,status=200,mimetype='application/json')
            response=view(*args,**kwargs)
            if response.status_code==200 and response.mimetype=='application/json' and not response.direct_passthrough:
                data=response.get_data()
                response_cache.put(key,data,len(data)+RESPONSE_ENTRY_OVERHEAD)
            return response
        return wrapper

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
    @cached
    def overview():
        filters,frame=charger_request({'ev_region_code'})
        ev_region=choice('ev_region_code',store.ev_regions)
        ev=store.ev if ev_region is None else store.ev.loc[store.ev.region_code.eq(ev_region)]
        count=store.counts(frame)
        return reply({'ev_registration':{'ev_registration_count':int(ev.ev_registration_count.sum()),
            'region_count':len(ev),'reference_month':EV_SOURCE['reference_month']},
            'chargers':count,'national_snapshot_totals':{'ev_registration_count':int(store.ev.ev_registration_count.sum()),**store.baseline}},
            {'ev_registration':EV_SOURCE,'chargers':API_SOURCE},
            {**filters,'ev_region_code':ev_region},frame,
            {'filter_scopes':{'region_code':'chargers_only','charger_type':'chargers_only',
                'deletion':'chargers_only','operator_id':'chargers_only','ev_region_code':'ev_registration_only'},
             'filter_options':store.filter_options()})

    @bp.get('/ev-registration')
    @cached
    def ev_registration():
        allowed_parameters({'region_code'})
        region=choice('region_code',store.ev_regions)
        frame=store.ev if region is None else store.ev.loc[store.ev.region_code.eq(region)]
        columns=['reference_month','region_system','region_code','region_name','region_code_2025','region_name_2025','ev_registration_count',
            'ev_passenger_count','ev_bus_count','ev_truck_count','ev_special_count','ev_noncommercial_count','ev_commercial_count']
        return reply(records(frame[columns]),{'ev_registration':EV_SOURCE},{'region_code':region},
            extra={'totals':{'ev_registration_count':int(frame.ev_registration_count.sum())},'count':len(frame)})

    @bp.get('/charger-regions')
    @cached
    def charger_regions():
        filters,frame=charger_request()
        result=store.grouped(frame,'zcode').rename(columns={'zcode':'region_code'})
        result['region_name']=result.region_code.map(REGIONS_2026)
        return reply(records(result),{'chargers':API_SOURCE},filters,frame,
            {'count':len(result),'station_count_additivity':'각 지역 안의 고유 충전소 수. 분류별 충전소 수는 중복 가능성이 있어 전국 값은 matched.station_count를 사용하세요.'})

    @bp.get('/regional-disparity')
    @cached
    def regional_disparity():
        filters, _ = charger_request()
        rows, national, frame, deletion_frame = store.regional_disparity(filters)
        return reply({'regions':rows,'national':national}, {'chargers':API_SOURCE},
            {**filters,'region_code':None,'deletion_share_deletion_filter':'all'}, frame,
            {'count':len(rows),'region_count':len(REGIONS_2026),
             'metric_rules':{'high_100kw':'output_kw >= 100 / positive numeric output count; missing/nonpositive/nonnumeric excluded',
                 'chargers_per_station':'charger count / distinct statId within region',
                 'type_mix':'charger type count / regional charger count',
                 'operator_hhi':'sum((operator charger count / denominator)^2) * 10000; grouped by (busiId,busiNm)',
                 'deletion_share':'delYn=Y / all delYn rows; deletion filter forced to all for this metric'},
             'national_basis':'Nationwide numerator and denominator are summed independently before division; national HHI is recalculated from nationwide operator counts.',
             'region_filter_policy':'region_code is accepted for request compatibility but ignored; always compares all 16 regions.',
             'deletion_share_policy':'Deletion share always uses all deletion statuses regardless of the requested deletion filter.',
             'ranking_policy':'Descending competition rank; ties share rank; null values are unranked.',
             'deletion_warning':'삭제 표시 비중은 자료상 delYn 표기이며 실제 이용 가능 여부가 아닙니다.',
             'same_period_shortage_rate_computed':False})

    @bp.get('/station-size-distribution')
    @cached
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
    @cached
    def charger_types():
        filters,frame=charger_request()
        result=store.grouped(frame,'chgerType').rename(columns={'chgerType':'charger_type_code'})
        result['official_definition']=result.charger_type_code.map(TYPE_DEFINITIONS).fillna('공식 정의 미확인')
        result['definition_verified']=result.charger_type_code.isin(TYPE_DEFINITIONS)
        return reply(records(result),{'chargers':API_SOURCE},filters,frame,
            {'count':len(result),'definition_source':'한국환경공단 활용가이드 v1.25 §3.3',
             'classification_note':'커넥터 유형을 출력/급속 분류로 임의 변환하지 않습니다. 관측 0건인 유형은 data에 나타나지 않습니다.'})

    @bp.get('/charger-output')
    @cached
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

    # Same text as /api/charger-output's output_note (each region's rebuilt response must equal that request).
    OUTPUT_NOTE='output(kW)을 수치화했습니다. powerType은 전체 결측이며 실제 동시 공급전력/실측 충전속도를 뜻하지 않습니다.'

    @bp.get('/charger-output/regions')
    @cached
    def charger_output_regions():
        """All 16 regions' /api/charger-output results in one request (Regional Explorer heatmap).
        data.common_meta + data.regions[i] rebuild exactly the response of
        /api/charger-output?{non-region filters}&region_code={region}:
        {data: regions[i].data, meta: {...common_meta, filters, matched, count, output_statistics}}."""
        allowed_parameters(COMMON_PARAMETERS)
        filters=charger_filters(store)
        regions,frame=store.output_by_region(filters)
        sources={'chargers':{**API_SOURCE,'snapshot_start_at':store.snapshot_start,'snapshot_end_at':store.snapshot_end}}
        common={'api_version':'1.0','sources':sources,'units':UNITS,'warnings':WARNINGS,
            'same_period_shortage_rate_computed':False,
            'snapshot_policy':'프로세스 시작 시 CSV를 읽은 고정 스냅샷. 갱신은 서버 재시작으로 반영.',
            'output_note':OUTPUT_NOTE}
        return reply({'common_meta':common,'regions':regions},{'chargers':API_SOURCE},{**filters,'region_code':None},frame,
            {'count':len(regions),'region_count':len(REGIONS_2026),
             'region_filter_policy':'region_code is accepted for request compatibility but ignored; always returns all 16 regions.',
             'per_region_response_rule':'For region R, {data: regions[R].data, meta: {...common_meta, filters, matched, count, output_statistics}} '
                 'equals /api/charger-output with the same non-region filters and region_code=R.'})

    @bp.get('/operators')
    @cached
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
    @cached
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

    def representative_table(filters,frame):
        """Per-station representative table for validated charger filters (cached).
        Shared by /locations and /locations/grid; cached tables are only read, never modified."""
        key=tuple(sorted(filters.items()))
        entry=locations_cache.get(key)
        if entry is None:
            result,invalid_rows=store.locations(frame)
            excluded_stations=int(frame.statId.nunique())-len(result)
            entry=(result,invalid_rows,excluded_stations)
            locations_cache.put(key,entry,table_bytes(result,shared_dictionaries))
        return entry

    def annotate_coordinate_quality(rows,filters,table):
        """Add coordinate_flag to suspicious station rows only; other rows are left exactly as they were.
        Flags come from the unfiltered table and are attached only when the row shows the same
        coordinate that was judged. Counts, grid cells, caches and coordinates are not touched."""
        unfiltered=table if all(filters.get(k) is None for k in ('region_code','charger_type','operator_id')) and filters.get('deletion')=='all' else None
        flags=store.coordinate_flags(unfiltered)
        for row in rows:
            if row is None:continue
            hit=flags.get(row.get('station_id'))
            if hit and abs(row['latitude']-hit[1])<=1e-6 and abs(row['longitude']-hit[2])<=1e-6:
                row['coordinate_flag']=hit[0]
        return rows

    def table_counts(result):
        return {'charger_count':int(result.charger_count.sum()),'station_count':len(result),
            'not_deleted_charger_count':int(result.not_deleted_charger_count.sum()),
            'deleted_charger_count':int(result.deleted_charger_count.sum())}

    def in_bbox(result,bbox):
        west,south,east,north=bbox
        return result.loc[result.longitude.between(west,east)&result.latitude.between(south,north)]

    @bp.get('/locations')
    def locations():
        filters,frame=charger_request({'page','limit','bbox'})
        page=integer('page',1,1,1000000);limit=integer('limit',200,1,1000);bbox=bounding_box()
        # The per-station representative table depends only on the validated charger
        # filters; bbox and pagination are applied to it below on every request, exactly
        # as before.
        table,invalid_rows,excluded_stations=representative_table(filters,frame)
        result=in_bbox(table,bbox) if bbox else table
        matched=table_counts(result)
        data,pagination=paginated(result,page,limit)
        annotate_coordinate_quality(data,filters,table)
        return reply(data,{'chargers':API_SOURCE},{**filters,'bbox':bbox},
            extra={'matched':matched,'pagination':pagination,'coordinate_reference_system':'WGS84 geographic latitude/longitude',
            'invalid_coordinate_rows_excluded_from_representative_selection':invalid_rows,
            'stations_without_valid_coordinates_excluded':excluded_stations,
            'coordinate_quality_rule':COORDINATE_QUALITY_RULE,
            'representative_coordinate_rule':'충전기 필터 적용 → statId별 N 우선/충전기 ID 순 첫 유효 좌표 → 대표 좌표에 bbox → statId 순 페이지네이션. 각 행의 건수는 해당 충전소의 필터 일치 충전기 수입니다.'})

    @bp.get('/locations/grid')
    @cached
    def location_grid():
        """All matching stations of the requested view aggregated into a fixed grid (map zoom 11–15).
        Unlike /locations pages, every station whose representative coordinate falls in the
        (cell-snapped) bbox is counted, so map clusters reflect the full spatial distribution."""
        filters,frame=charger_request({'bbox','zoom'})
        if 'zoom' not in request.args:raise APIError('zoom이 필요합니다.','zoom')
        zoom=integer('zoom',GRID_MIN_ZOOM,GRID_MIN_ZOOM,GRID_MAX_ZOOM)
        bbox=bounding_box()
        if bbox is None:raise APIError('bbox가 필요합니다.','bbox')
        dlat,dlng,meters=grid_cell_degrees(zoom)
        west,south,east,north=bbox
        ix0,ix1=math.floor(west/dlng),math.floor(east/dlng)
        iy0,iy1=math.floor(south/dlat),math.floor(north/dlat)
        span=(ix1-ix0+1)*(iy1-iy0+1)
        if span>GRID_MAX_CELLS:
            raise APIError(f'이 줌에서 bbox가 너무 넓습니다(격자 {span}칸, 최대 {GRID_MAX_CELLS}칸).','bbox')
        table,invalid_rows,excluded_stations=representative_table(filters,frame)
        matched=table_counts(in_bbox(table,bbox))
        # Cheap rectangular prefilter, then exact cell membership with the same floor() as the bounds.
        loose=table.loc[table.longitude.between((ix0-1)*dlng,(ix1+2)*dlng)&table.latitude.between((iy0-1)*dlat,(iy1+2)*dlat)]
        ix=np.floor(loose.longitude.to_numpy(dtype=float)/dlng).astype(np.int64)
        iy=np.floor(loose.latitude.to_numpy(dtype=float)/dlat).astype(np.int64)
        keep=(ix>=ix0)&(ix<=ix1)&(iy>=iy0)&(iy<=iy1)
        sub=loose.iloc[np.flatnonzero(keep)]
        ix,iy=ix[keep],iy[keep]
        cells=[]
        if len(sub):
            g=pd.DataFrame({'ix':ix,'iy':iy,'lat':sub.latitude.to_numpy(dtype=float),'lng':sub.longitude.to_numpy(dtype=float),
                'c':sub.charger_count.to_numpy(),'nd':sub.not_deleted_charger_count.to_numpy(),'d':sub.deleted_charger_count.to_numpy()})
            agg=g.groupby(['iy','ix'],sort=True).agg(station_count=('lat','size'),charger_count=('c','sum'),
                not_deleted_charger_count=('nd','sum'),deleted_charger_count=('d','sum'),
                latitude=('lat','mean'),longitude=('lng','mean'),
                south=('lat','min'),north=('lat','max'),west=('lng','min'),east=('lng','max')).reset_index()
            size=g.groupby(['iy','ix']).lat.transform('size').to_numpy()
            singles=np.flatnonzero(size==1)
            single_rows=annotate_coordinate_quality(records(sub.iloc[singles]),filters,table)
            station_rows={(int(iy[i]),int(ix[i])):row for i,row in zip(singles,single_rows)}
            for row in records(agg):
                key=(row.pop('iy'),row.pop('ix'))
                row['cell']=[key[1],key[0]]
                for name in ('latitude','longitude','south','west','north','east'):row[name]=round(row[name],7)
                row['station']=station_rows.get(key)
                cells.append(row)
        totals={'cell_count':len(cells),'station_count':sum(c['station_count'] for c in cells),
            'charger_count':sum(c['charger_count'] for c in cells)}
        return reply(cells,{'chargers':API_SOURCE},{**filters,'bbox':bbox,'zoom':zoom},
            extra={'matched':matched,
            'grid':{'zoom':zoom,'cell_px':GRID_CELL_PX,'cell_meters':meters,'cell_degrees':{'lat':dlat,'lng':dlng},
                'origin':[0,0],'snapped_bbox':[ix0*dlng,iy0*dlat,(ix1+1)*dlng,(iy1+1)*dlat],**totals},
            'coordinate_reference_system':'WGS84 geographic latitude/longitude',
            'invalid_coordinate_rows_excluded_from_representative_selection':invalid_rows,
            'stations_without_valid_coordinates_excluded':excluded_stations,
            'coordinate_quality_rule':COORDINATE_QUALITY_RULE,
            'aggregation_rule':'/api/locations와 같은 대표 좌표(충전기 필터 → statId별 N 우선/충전기 ID 순 첫 유효 좌표). '
                '격자 칸 = floor(경도/칸 경도폭), floor(위도/칸 위도폭). bbox를 감싸는 모든 칸의 충전소를 빠짐없이 집계하며, '
                'matched는 요청 bbox 안(경계 포함) 충전소만 셉니다. 칸에 충전소가 1곳이면 station에 그 행을 넣습니다.'})

    def chart_record(item):
        return {'id':item['number'],'filename':item['file'],'title':item['purpose'],'chart_type':item['kind'],
            'purpose':item['purpose'],'data':item['data'],'reason':item['reason'],'results':item['results'],
            'caution':item['caution'],'period':item['period'],'metrics':item['metrics'],
            'image_pixels':item['image_pixels'],'dpi':item['dpi'],'sha256':item['sha256'],
            'image_url':f"/api/charts/{item['number']}/image",'filters_apply':False}

    @bp.get('/charts')
    @cached
    def charts():
        allowed_parameters({'chart_id'})
        chart_id=integer('chart_id',1,1,10) if 'chart_id' in request.args else None
        rows=[chart_record(i) for i in store.chart_metadata if chart_id is None or i['number']==chart_id]
        return reply(rows,{'chart_metadata':{'file':'chart_verification.json','source':'기존 검증된 그래프 메타데이터','reference':'각 그래프 period 필드 참조'}},
            {'chart_id':chart_id},extra={'count':len(rows),'static_chart_warning':'PNG는 제작 당시의 고정 그래프이며 API 필터로 다시 생성하지 않습니다. 등록 PNG(1~3번)는 2025-12 기준·당시 17개 시도(광주·전남 따로) 기록이고, 현재 인터랙티브 등록 그래프는 2026-09 기준·16개 지역(전남광주 통합)입니다.'})

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

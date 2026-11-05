import json
import math
import pandas as pd
import pytest

ENDPOINTS=['overview','ev-registration','charger-regions','charger-types','charger-output','operators','growth','locations','charts','regional-disparity']


@pytest.mark.parametrize('endpoint',ENDPOINTS)
def test_json_contract(client,endpoint):
    response=client.get('/api/'+endpoint)
    assert response.status_code==200
    assert response.is_json
    payload=response.get_json()
    assert set(payload)=={'data','meta'}
    assert payload['meta']['sources'] and payload['meta']['units']
    assert payload['meta']['same_period_shortage_rate_computed'] is False
    json.loads(response.text,parse_constant=lambda v:(_ for _ in ()).throw(AssertionError(v)))
    assert 'DATA_GO_KR_SERVICE_KEY' not in response.text and 'ServiceKey=' not in response.text


def test_overview_expected_snapshot(client):
    body=client.get('/api/overview').get_json()
    assert body['data']['ev_registration']['ev_registration_count']==1191873
    assert body['data']['chargers']=={'charger_count':527433,'station_count':101091,
        'not_deleted_charger_count':523312,'deleted_charger_count':4121}
    assert body['meta']['sources']['ev_registration']['reference_month']=='2026-09'
    assert body['meta']['sources']['chargers']['snapshot_date']=='2026-10-15'
    options=body['meta']['filter_options']
    assert len(options['ev_regions'])==16 and len(options['charger_regions'])==16
    assert any(r['code']=='09' and r['observed_charger_count']==0 for r in options['charger_types'])


def test_overview_separate_scopes(client):
    body=client.get('/api/overview?region_code=12&ev_region_code=12&deletion=not_deleted').get_json()
    assert body['data']['ev_registration']['ev_registration_count']==79371
    assert body['data']['chargers']['charger_count']==32546
    assert body['data']['national_snapshot_totals']['charger_count']==527433
    assert body['meta']['filter_scopes']['ev_region_code']=='ev_registration_only'


def test_ev_16_regions_and_reconciliation(client):
    body=client.get('/api/ev-registration').get_json()
    rows=body['data']
    assert len(rows)==16 and sum(r['ev_registration_count'] for r in rows)==1191873
    for row in rows:
        assert row['ev_registration_count']==sum(row[k] for k in ['ev_passenger_count','ev_bus_count','ev_truck_count','ev_special_count'])
        assert row['ev_registration_count']==row['ev_commercial_count']+row['ev_noncommercial_count']
    by_code={r['region_code']:r for r in rows}
    assert by_code['12']['ev_registration_count']==79371
    assert '29' not in by_code and '46' not in by_code
    assert client.get('/api/ev-registration?region_code=12').status_code==200
    assert client.get('/api/charger-regions?region_code=29').status_code==400


CASES=[{}, {'deletion':'not_deleted'}, {'region_code':'12'}, {'charger_type':'11'},
    {'region_code':'11','charger_type':'02','deletion':'deleted'},
    {'charger_type':'09'}, {'region_code':'50','charger_type':'04','deletion':'not_deleted'},
    {'operator_id':'PW','deletion':'not_deleted'}]


@pytest.mark.parametrize('query',CASES)
def test_all_filtered_aggregates(client,truth,query):
    expected=truth
    for parameter,col in [('region_code','zcode'),('charger_type','chgerType'),('operator_id','busiId')]:
        if parameter in query:expected=expected[expected[col]==query[parameter]]
    if query.get('deletion','all')!='all':expected=expected[expected.delYn==('N' if query['deletion']=='not_deleted' else 'Y')]
    counts={'charger_count':len(expected),'station_count':expected.statId.nunique(),
        'not_deleted_charger_count':expected.delYn.eq('N').sum(),'deleted_charger_count':expected.delYn.eq('Y').sum()}
    for endpoint in ['overview','charger-regions','charger-types','charger-output','operators']:
        body=client.get('/api/'+endpoint,query_string=query).get_json()
        assert body.get('meta',{}).get('matched')==counts,(endpoint,query,body)
        if endpoint in ['charger-regions','charger-types','charger-output']:
            assert sum(row['charger_count'] for row in body['data'])==len(expected)
            assert sum(row['not_deleted_charger_count'] for row in body['data'])==counts['not_deleted_charger_count']
            assert sum(row['deleted_charger_count'] for row in body['data'])==counts['deleted_charger_count']
            assert math.isclose(sum(row['share_pct'] for row in body['data']),100 if len(expected) else 0)
        if endpoint=='operators':
            assert body['meta']['pagination']['total_items']==expected[['busiId','busiNm']].drop_duplicates().shape[0]


def test_official_type11_and_empty_type09(client):
    body=client.get('/api/charger-types?charger_type=11').get_json()
    assert body['data'][0]['official_definition']=='DC콤보2(버스전용)'
    assert body['data'][0]['charger_count']==5587
    empty=client.get('/api/charger-output?charger_type=09').get_json()
    assert empty['data']==[]
    assert empty['meta']['output_statistics']['median_kw'] is None


def test_output_missing_and_positive(client):
    body=client.get('/api/charger-output?deletion=not_deleted').get_json()
    assert body['meta']['output_statistics']=={'valid_positive_count':523143,'invalid_or_missing_count':169,
        'median_kw':7.0,'min_kw':3.0,'max_kw':400.0}
    missing=[r for r in body['data'] if r['value_status']=='missing']
    assert len(missing)==1 and missing[0]['output_kw'] is None and missing[0]['charger_count']==169


@pytest.mark.parametrize('query', [
    {}, {'deletion':'not_deleted'}, {'deletion':'deleted'}, {'charger_type':'11'},
    {'operator_id':'PW','deletion':'not_deleted'}, {'region_code':'12','charger_type':'04'}])
def test_regional_disparity_independent_reconciliation(client, truth, query):
    body=client.get('/api/regional-disparity',query_string=query).get_json()
    assert len(body['data']['regions'])==16
    rows=body['data']['regions']; national=body['data']['national']
    # Independently apply non-region, requested deletion filters to the raw fixture.
    selected=truth.copy()
    for parameter,col in [('charger_type','chgerType'),('operator_id','busiId')]:
        if parameter in query: selected=selected[selected[col]==query[parameter]]
    if query.get('deletion','all')!='all': selected=selected[selected.delYn==('N' if query['deletion']=='not_deleted' else 'Y')]
    assert sum(r['charger_count'] for r in rows)==len(selected)
    assert sum(r['station_count'] for r in rows)==selected.groupby('zcode').statId.nunique().sum()
    valid=pd.to_numeric(selected.output,errors='coerce')
    denominator=int(valid.gt(0).sum()); numerator=int(valid.ge(100).sum())
    assert national['high_100kw']['numerator']==numerator
    assert national['high_100kw']['denominator']==denominator
    assert national['high_100kw']['value_pct']==pytest.approx(numerator/denominator*100 if denominator else None) if denominator else national['high_100kw']['value_pct'] is None
    # Deletion share ignores only the deletion filter; type/operator filters remain.
    deletion_base=truth.copy()
    for parameter,col in [('charger_type','chgerType'),('operator_id','busiId')]:
        if parameter in query: deletion_base=deletion_base[deletion_base[col]==query[parameter]]
    assert national['deletion_share']['numerator']==int(deletion_base.delYn.eq('Y').sum())
    assert national['deletion_share']['denominator']==len(deletion_base)
    by_operator=selected.groupby(['busiId','busiNm']).size()
    expected_hhi=sum((int(v)/len(selected))**2 for v in by_operator)*10000 if len(selected) else None
    assert national['operator_hhi']['value']==pytest.approx(expected_hhi) if expected_hhi is not None else national['operator_hhi']['value'] is None
    assert body['meta']['region_filter_policy'].startswith('region_code is accepted')
    assert body['meta']['same_period_shortage_rate_computed'] is False


def test_regional_disparity_rejects_invalid_filters(client):
    assert client.get('/api/regional-disparity?charger_type=bogus').status_code==400
    assert client.get('/api/regional-disparity?region_code=29').status_code==400


@pytest.mark.parametrize('deletion', ['all', 'not_deleted', 'deleted'])
def test_regional_disparity_empty_valid_type(client, deletion):
    response=client.get('/api/regional-disparity',query_string={'charger_type':'09', 'deletion':deletion})
    assert response.status_code==200
    data=response.get_json()['data']
    assert len(data['regions'])==16
    assert all(row['charger_count']==0 and row['station_count']==0 for row in data['regions'])
    assert all(row['metrics']['high_100kw']['value_pct'] is None
               and row['metrics']['chargers_per_station']['value'] is None
               and row['metrics']['deletion_share']['value_pct'] is None
               and row['metrics']['type_mix']==[] for row in data['regions'])
    assert data['national']['high_100kw']=={'numerator':0, 'denominator':0, 'value_pct':None}
    assert data['national']['chargers_per_station']=={'numerator':0, 'denominator':0, 'value':None}
    assert data['national']['deletion_share']=={'numerator':0, 'denominator':0, 'value_pct':None}
    assert data['national']['operator_hhi']['value'] is None


def test_regional_disparity_zero_share_tied_rank(client):
    data=client.get('/api/regional-disparity?deletion=deleted').get_json()['data']
    rows=data['regions']
    zero=[]
    for row in rows:
        item=next((item for item in row['metrics']['type_mix']
                   if item['charger_type_code']=='04'), None)
        if row['charger_count'] and item['charger_count']==0:
            assert item['denominator']==row['charger_count']
            assert item['value_pct']==0
            zero.append((row['region_code'], item['rank']))
    assert {code for code, _ in zero}=={'36', '43'}
    assert len({rank for _, rank in zero})==1
    positive=sum(any(item['charger_type_code']=='04' and item['charger_count']>0
                     for item in row['metrics']['type_mix']) for row in rows)
    assert zero[0][1]==positive+1


def test_operators_all_pages_and_whitespace(client):
    pages=[client.get('/api/operators',query_string={'page':i,'limit':200}).get_json() for i in [1,2]]
    rows=pages[0]['data']+pages[1]['data']
    assert len(rows)==342 and sum(r['charger_count'] for r in rows)==527433
    gs=next(r for r in rows if r['operator_id']=='PI' and r['operator_name']=='GS차지비')
    assert gs['charger_count']==83138
    assert len({(r['operator_id'],r['operator_name']) for r in rows})==342
    assert pages[1]['meta']['pagination']['has_next'] is False


def test_growth_dates_and_partial_year(client):
    body=client.get('/api/growth?year_from=2025&year_to=2026').get_json()
    assert body['data']==[
        {'year':2025,'annual_installed_count':89805,'cumulative_count':478802,'completed_calendar_year':True,'is_partial_year':False,'measurement_cutoff_date':None},
        {'year':2026,'annual_installed_count':61408,'cumulative_count':540210,'completed_calendar_year':False,'is_partial_year':True,'measurement_cutoff_date':None}]
    assert body['meta']['sources']['growth']['partial_year']==2026
    assert body['meta']['sources']['growth']['measurement_cutoff_date'] is None


def test_locations_limit_unique_and_pagination(client):
    first=client.get('/api/locations?limit=25').get_json()
    second=client.get('/api/locations?limit=25&page=2').get_json()
    assert first['meta']['pagination']['total_items']==101091
    assert first['meta']['matched']['charger_count']==527433
    assert len(first['data'])==len(second['data'])==25
    assert not {r['station_id'] for r in first['data']}&{r['station_id'] for r in second['data']}
    assert first['data'][0]['station_id']<second['data'][0]['station_id']
    assert all(isinstance(r['latitude'],float) and isinstance(r['longitude'],float) for r in first['data'])
    assert all(r['charger_count']==r['not_deleted_charger_count']+r['deleted_charger_count'] for r in first['data'])


def test_locations_combined_filter_and_bbox(client,truth):
    query={'region_code':'12','charger_type':'11','deletion':'not_deleted','limit':1000}
    expected=truth[(truth.zcode=='12')&(truth.chgerType=='11')&(truth.delYn=='N')]
    body=client.get('/api/locations',query_string=query).get_json()
    assert body['meta']['pagination']['total_items']==expected.statId.nunique()
    assert sum(r['charger_count'] for r in body['data'])==len(expected)
    assert {r['station_id'] for r in body['data']}==set(expected.statId)
    bounded=client.get('/api/locations?bbox=126.8,37.4,127.2,37.7&limit=100').get_json()
    assert bounded['data']
    assert all(126.8<=r['longitude']<=127.2 and 37.4<=r['latitude']<=37.7 for r in bounded['data'])
    empty=client.get('/api/locations?bbox=0,0,1,1').get_json()
    assert empty['data']==[] and empty['meta']['matched']['station_count']==0
    assert client.get('/api/locations?page=1000000').get_json()['data']==[]


def test_charts_and_png(client):
    body=client.get('/api/charts').get_json()
    assert len(body['data'])==10
    assert {r['id'] for r in body['data']}==set(range(1,11))
    assert all(r['filters_apply'] is False for r in body['data'])
    image=client.get('/api/charts/7/image')
    assert image.status_code==200 and image.mimetype=='image/png'
    assert image.data.startswith(b'\x89PNG\r\n\x1a\n')
    assert client.get('/api/charts?chart_id=7').get_json()['data'][0]['filename']=='07_charger_output_histogram.png'
    assert client.get('/api/charts/99/image').status_code==404


@pytest.mark.parametrize('path',[
    '/api/locations?page=0','/api/locations?page=-1','/api/locations?page=1.5','/api/locations?page=NaN',
    '/api/locations?limit=1001','/api/locations?limit=0','/api/operators?limit=201',
    '/api/locations?bbox=NaN,0,1,1','/api/locations?bbox=0,0,Infinity,1','/api/locations?bbox=1,0,0,1',
    '/api/locations?bbox=0,0,1','/api/locations?bbox=0,-91,1,1','/api/locations?bbox=0,0,181,1',
    '/api/charger-types?charger_type=99','/api/charger-types?charger_type=2',
    '/api/charger-regions?region_code=29','/api/ev-registration?region_code=29',
    '/api/ev-registration?charger_type=02','/api/charger-regions?deletion=available',
    '/api/charger-regions?region_code=','/api/charger-regions?region_code=11&region_code=12',
    '/api/charger-regions?operator_id=NOT_FOUND','/api/overview?ev_region_code=46',
    '/api/growth?region_code=11','/api/growth?charger_type=02','/api/growth?year_from=2026&year_to=2025',
    '/api/growth?year_from=2030','/api/charts?region_code=11','/api/charts?chart_id=11',
    '/api/overview?ServiceKey=do-not-echo-this-value'])
def test_invalid_queries_are_json_400(client,path):
    response=client.get(path)
    assert response.status_code==400,response.text
    assert response.is_json and response.get_json()['error']['code']=='INVALID_PARAMETER'
    assert 'do-not-echo-this-value' not in response.text


def test_method_and_unknown_route_json(client):
    assert client.post('/api/overview').status_code==405
    assert client.post('/api/overview').is_json
    assert client.get('/not-found').status_code==404
    assert client.get('/.env').status_code==404
    assert client.get('/api/charts/../../.env').status_code==404


def test_cors_allowlist_and_preflight(client):
    allowed=client.get('/api/growth',headers={'Origin':'http://localhost:5173'})
    assert allowed.headers['Access-Control-Allow-Origin']=='http://localhost:5173'
    assert 'Access-Control-Allow-Credentials' not in allowed.headers
    denied=client.get('/api/growth',headers={'Origin':'https://untrusted.example'})
    assert 'Access-Control-Allow-Origin' not in denied.headers
    preflight=client.options('/api/locations',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'GET'})
    assert preflight.status_code==200 and 'GET' in preflight.headers['Access-Control-Allow-Methods']


def test_snapshot_is_unchanged_by_requests(client,app):
    before=app.extensions['chargegap_data'].baseline.copy()
    client.get('/api/charger-regions?region_code=12&deletion=deleted')
    client.get('/api/charger-types?charger_type=09')
    assert client.get('/api/overview').get_json()['data']['chargers']==before

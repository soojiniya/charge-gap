"""Current registration CSV, compatibility, and separation from charger filters."""
from pathlib import Path
import pandas as pd
import pytest


@pytest.fixture(scope='module')
def registration_truth():
    return pd.read_csv(Path(__file__).resolve().parents[2]/'data/processed/ev_registration_by_region_2026_09.csv',
                       dtype={'region_code':str},keep_default_na=False)


def test_registration_csv_matches_all_api_metrics(client,registration_truth):
    payload=client.get('/api/ev-registration').get_json()
    indexed={r['region_code']:r for r in payload['data']}
    assert payload['meta']['sources']['ev_registration']['file']=='ev_registration_by_region_2026_09.csv'
    assert payload['meta']['sources']['ev_registration']['reference_month']=='2026-09'
    for _,expected in registration_truth.iterrows():
        row=indexed[expected.region_code]
        for metric in ['ev_registration_count','ev_passenger_count','ev_bus_count','ev_truck_count',
                       'ev_special_count','ev_noncommercial_count','ev_commercial_count']:
            assert row[metric]==int(expected[metric])
        assert row['region_code']==row['region_code_2025']
        assert row['region_name']==row['region_name_2025']==expected.region_name
        assert row['reference_month']=='2026-09'
    assert sum(r['ev_registration_count'] for r in indexed.values())==1191873


@pytest.mark.parametrize('code','11 12 26 27 28 30 31 36 41 43 44 47 48 50 51 52'.split())
def test_all_16_regions_can_filter_both_sources(client,registration_truth,code):
    expected=int(registration_truth.loc[registration_truth.region_code.eq(code),'ev_registration_count'].iloc[0])
    ev=client.get('/api/ev-registration?region_code='+code)
    overview=client.get('/api/overview?region_code='+code+'&ev_region_code='+code)
    assert ev.status_code==overview.status_code==200
    assert len(ev.get_json()['data'])==1
    data=overview.get_json()['data']
    assert data['ev_registration']['ev_registration_count']==expected
    assert data['ev_registration']['reference_month']=='2026-09'
    assert data['national_snapshot_totals']['ev_registration_count']==1191873


def test_region_12_map_and_independent_charger_filters(client):
    all_rows=client.get('/api/overview?region_code=12&ev_region_code=12').get_json()
    selected=client.get('/api/overview?region_code=12&ev_region_code=12&charger_type=04&deletion=not_deleted&operator_id=ME').get_json()
    assert all_rows['data']['ev_registration']==selected['data']['ev_registration']
    assert selected['data']['ev_registration']['ev_registration_count']==79371
    assert all_rows['meta']['sources']['chargers']['snapshot_date']=='2026-10-15'
    assert all_rows['meta']['same_period_shortage_rate_computed'] is False
    assert set(r['code'] for r in all_rows['meta']['filter_options']['ev_regions'])==set(r['code'] for r in all_rows['meta']['filter_options']['charger_regions'])
    response=client.get('/api/locations?region_code=12&limit=2&page=2')
    assert response.status_code==200 and len(response.get_json()['data'])==2
    assert all(r['region_code']=='12' for r in response.get_json()['data'])


def test_historic_png_metadata_is_not_relabelled(client):
    payload=client.get('/api/charts?chart_id=1').get_json()
    assert '2025' in payload['data'][0]['period']
    assert '2026-09' in payload['meta']['static_chart_warning']


@pytest.mark.parametrize('code',['29','46'])
def test_old_regions_are_not_silently_remapped(client,code):
    assert client.get('/api/ev-registration?region_code='+code).status_code==400
    assert client.get('/api/overview?ev_region_code='+code).status_code==400

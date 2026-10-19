"""Semantics at risk when dictionary encoding and narrowing map frames."""
import hashlib

import pandas as pd
import pytest

from chargegap_api.data import DataStore


@pytest.fixture
def categorical_stations():
    rows = [
        # Invalid siblings still count; deleted valid rows cannot beat N rows.
        ['A','01','N',0,0], ['A','02','N',37,127], ['A','00','Y',38,128],
        # Charger IDs sort as strings: "10" precedes "2".
        ['B','2','N',36,126], ['B','10','N',35,125],
        ['C','01','N',0,0],
    ]
    frame = pd.DataFrame(rows,columns=['statId','chgerId','delYn','_lat','_lng'])
    frame['zcode']='11'; frame['statNm']=frame.statId; frame['addr']='address'
    for column in ['statId','chgerId','delYn','zcode','statNm','addr']:
        frame[column]=frame[column].astype('category')
    frame['statId']=frame.statId.cat.add_categories(['UNOBSERVED'])
    frame['zcode']=frame.zcode.cat.add_categories(['12'])
    return frame


def test_representatives_and_invalid_sibling_totals(categorical_stations):
    store=object.__new__(DataStore)
    rows,invalid=store.locations(categorical_stations)
    assert invalid==2
    assert list(rows.station_id)==['A','B']
    assert list(rows.latitude)==[37,35]
    assert list(rows.longitude)==[127,125]
    assert list(rows.charger_count)==[3,2]
    assert list(rows.deleted_charger_count)==[1,0]
    assert list(rows.not_deleted_charger_count)==[2,2]


def test_filters_precede_representative_selection(categorical_stations):
    store=object.__new__(DataStore)
    rows,invalid=store.locations(categorical_stations.loc[categorical_stations.delYn.eq('Y')])
    assert invalid==0
    assert list(rows.station_id)==['A']
    assert list(rows.latitude)==[38]
    assert list(rows.charger_count)==[1]


def test_unobserved_categories_do_not_create_samples(categorical_stations):
    rows=DataStore.station_size_distribution(categorical_stations)
    assert len(rows)==1 and rows[0]['region_code']=='11'
    assert rows[0]['sample_count']==3
    assert rows[0]['charger_count']==6
    empty= categorical_stations.iloc[:0]
    assert DataStore.station_size_distribution(empty)==[]
    locations,invalid=object.__new__(DataStore).locations(empty)
    assert locations.empty and invalid==0


def test_read_only_snapshot_survives_repeated_and_filtered_calls(app):
    store=app.extensions['chargegap_data']
    def digest():
        return hashlib.sha256(pd.util.hash_pandas_object(store.chargers,index=True).values.tobytes()).hexdigest()
    before=digest()
    assert store.select({'deletion':'all'}) is store.chargers
    with app.test_client() as client:
        for path in ['/api/locations?limit=1','/api/locations?deletion=deleted',
                     '/api/charger-types?charger_type=09','/api/station-size-distribution?region_code=12',
                     '/api/charger-output','/api/operators']:
            assert client.get(path).status_code==200
    assert digest()==before

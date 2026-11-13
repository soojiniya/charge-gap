"""Coordinate-quality notice (coordinate_flag): rules, real-snapshot reproduction, and invariance.

The flag is display-only. It must appear on suspicious station rows only, and every other part of
the responses (coordinates, counts, grid cells, pagination, caches) must equal the response the
same request gives with the feature switched off.
"""
import json
from pathlib import Path

import pandas as pd
import pytest

from chargegap_api import create_app
from chargegap_api.data import COORDINATE_FLAGS, address_sgg, coordinate_quality_flags

REPORT = Path(__file__).resolve().parents[2]/'reports/coordinate_quality_2026-11-13.json'
# 줌 15에서 충전소 1곳만 있는 격자 칸에 놓인 far_from_address 충전소
FLAGGED_SINGLE = ('CGC00001', 37.331717, 127.4637585)
SINGLE_BBOX = '127.4598,37.3287,127.4678,37.3347'


def table(rows):
    return pd.DataFrame(rows, columns=['station_id', 'address', 'latitude', 'longitude'])


# ---------- rules (synthetic) ----------

def test_address_sgg_normalizes_province_spelling():
    assert address_sgg('서울 강남구 테헤란로 1') == address_sgg('서울특별시 강남구 역삼로 2') == '서울특별시 강남구'
    assert address_sgg('강원도 춘천시 x') == address_sgg('강원특별자치도 춘천시 y')
    assert address_sgg('') == ''


def test_shared_coordinate_needs_three_stations_from_two_districts():
    base = [('A', '서울 강남구 1', 37.512345, 127.012345), ('B', '서울 강남구 2', 37.512345, 127.012345)]
    same_district = table(base + [('C', '서울특별시 강남구 3', 37.512345, 127.012345)])
    assert coordinate_quality_flags(same_district) == {}
    mixed = table(base + [('C', '서울 서초구 3', 37.512345, 127.012345)])
    assert {k: v[0] for k, v in coordinate_quality_flags(mixed).items()} == dict.fromkeys('ABC', 'placeholder')
    two_only = table(base[:1] + [('C', '서울 서초구 3', 37.512345, 127.012345)])
    assert coordinate_quality_flags(two_only) == {}


def test_one_decimal_rule_needs_both_axes():
    rows = table([('A', '대전 서구 1', 36.3, 127.3), ('B', '대전 서구 2', 36.3, 127.35),
                  ('C', '대전 서구 3', 36.35, 127.3), ('D', '대전 서구 4', 36.0, 127.0)])
    assert {k: v[0] for k, v in coordinate_quality_flags(rows).items()} == {'A': 'placeholder', 'D': 'placeholder'}


def test_far_rule_boundary_is_100km_from_district_median():
    near = [(f'N{i}', '충남 논산시 x', 36.201234 + i*1e-4, 127.101234) for i in range(5)]
    km_per_deg_lat = 110.57
    rows = table(near + [('F99', '충남 논산시 y', 36.201434 + 99/km_per_deg_lat, 127.101234),
                         ('F101', '충남 논산시 z', 36.201434 + 101/km_per_deg_lat, 127.101234)])
    flags = coordinate_quality_flags(rows)
    assert set(flags) == {'F101'} and flags['F101'][0] == 'far_from_address'


def test_both_rules_give_combined_flag_and_keep_judged_coordinate():
    near = [(f'N{i}', '경기 파주시 x', 37.761234 + i*1e-4, 126.781234) for i in range(5)]
    rows = table(near + [('X', '경기 파주시 y', 34.0, 130.1)])
    assert coordinate_quality_flags(rows) == {'X': ('placeholder_far_from_address', 34.0, 130.1)}
    assert coordinate_quality_flags(table([])) == {}


# ---------- real snapshot ----------

@pytest.fixture(scope='module')
def store(app):
    return app.extensions['chargegap_data']


def test_real_snapshot_reproduces_report(store):
    flags = store.coordinate_flags()
    placeholder = {k for k, v in flags.items() if v[0].startswith('placeholder')}
    far = {k for k, v in flags.items() if v[0].endswith('far_from_address')}
    assert (len(placeholder), len(far), len(placeholder & far), len(flags)) == (508, 182, 46, 644)
    assert {v[0] for v in flags.values()} == set(COORDINATE_FLAGS)
    report = json.loads(REPORT.read_text(encoding='utf-8'))
    assert report['meta']['counts']['union'] == 644 and report['meta']['counts']['charger_count'] == 3322
    expected = {s['station_id']: set(s['flags']) for s in report['stations']}
    assert set(flags) == set(expected)
    for station_id, (flag, _, _) in flags.items():
        assert {'placeholder', 'far_from_address'} & set(flag.replace('placeholder_far', 'placeholder far').split()) \
            == expected[station_id]
    in_union = store.chargers.statId.isin(list(flags))
    assert int(in_union.sum()) == 3322
    # Computed once per process and reused.
    assert store.coordinate_flags() is flags


@pytest.fixture()
def apps(store):
    """Two apps over the same snapshot without a response cache, so each request is computed."""
    config = {'TESTING': True, 'DATA_STORE': store, 'RESPONSE_CACHE_BYTES': 0}
    return create_app(config), create_app(config)


def strip(body):
    body = json.loads(json.dumps(body))
    body['meta'].pop('coordinate_quality_rule')
    for row in body['data']:
        row.pop('coordinate_flag', None)
        if isinstance(row.get('station'), dict):
            row['station'].pop('coordinate_flag', None)
    return body


REQUESTS = [
    '/api/locations?limit=1000',
    '/api/locations?limit=1000&page=2',
    '/api/locations?limit=1000&bbox=127.3,36.25,127.5,36.45',         # 대전: 겹친 대체 좌표
    '/api/locations?limit=1000&bbox=124.9,32.9,125.1,33.1',           # 제주 서쪽 바다 33.0,125.0
    '/api/locations?limit=1000&bbox=127.3,36.25,127.5,36.45&deletion=not_deleted&charger_type=02',
    '/api/locations?limit=1000&region_code=30',
    '/api/locations/grid?zoom=11&bbox=126.4,37.0,127.6,37.9',
    '/api/locations/grid?zoom=13&bbox=127.3,36.25,127.5,36.45',
    f'/api/locations/grid?zoom=15&bbox={SINGLE_BBOX}',
    f'/api/locations/grid?zoom=15&bbox={SINGLE_BBOX}&deletion=not_deleted',
    '/api/locations/grid?zoom=15&bbox=128.16,35.535,128.175,35.545',
]


@pytest.mark.parametrize('path', REQUESTS)
def test_only_the_flag_differs_from_feature_off(apps, store, monkeypatch, path):
    on_app, off_app = apps
    on = on_app.test_client().get(path)
    assert on.status_code == 200
    with monkeypatch.context() as patch:
        patch.setattr(store, 'coordinate_flags', lambda unfiltered_table=None: {})
        off = off_app.test_client().get(path)
    assert off.status_code == 200
    on_body, off_body = on.get_json(), off.get_json()
    assert strip(on_body) == strip(off_body)
    # Unflagged rows carry no key at all (not even null); flagged rows carry one known value.
    rows = [r for r in on_body['data']] if path.startswith('/api/locations?') else \
        [c['station'] for c in on_body['data'] if c['station']]
    for row in rows:
        if 'coordinate_flag' in row:
            assert row['coordinate_flag'] in COORDINATE_FLAGS
            judged = store.coordinate_flags()[row['station_id']]
            assert (row['latitude'], row['longitude']) == pytest.approx(judged[1:], abs=1e-6)
        else:
            assert row['station_id'] not in store.coordinate_flags()


def test_flagged_and_normal_rows_in_real_views(client, store):
    flags = store.coordinate_flags()
    daejeon = client.get('/api/locations?limit=1000&bbox=127.3,36.25,127.5,36.45').get_json()['data']
    flagged = [r for r in daejeon if 'coordinate_flag' in r]
    assert flagged and len(flagged) < len(daejeon)
    assert {r['station_id'] for r in flagged} == {r['station_id'] for r in daejeon if r['station_id'] in flags}
    station_id, lat, lng = FLAGGED_SINGLE
    cells = client.get(f'/api/locations/grid?zoom=15&bbox={SINGLE_BBOX}').get_json()['data']
    singles = [c['station'] for c in cells if c['station'] and c['station']['station_id'] == station_id]
    assert singles and singles[0]['coordinate_flag'] == 'far_from_address'
    assert (singles[0]['latitude'], singles[0]['longitude']) == (lat, lng)


def test_filtered_rows_keep_flag_only_with_judged_coordinate(client, store):
    flags = store.coordinate_flags()
    for query in ['deletion=not_deleted', 'charger_type=02', 'charger_type=04', 'region_code=30']:
        page, seen = 1, 0
        while True:
            body = client.get(f'/api/locations?limit=1000&page={page}&{query}').get_json()
            for row in body['data']:
                hit = flags.get(row['station_id'])
                same = hit and abs(row['latitude'] - hit[1]) <= 1e-6 and abs(row['longitude'] - hit[2]) <= 1e-6
                assert ('coordinate_flag' in row) == bool(same)
                seen += 'coordinate_flag' in row
            if not body['meta']['pagination']['has_next']:
                break
            page += 1
        assert seen > 0


def test_flag_does_not_change_locations_cache_size(apps, store):
    on_app, _ = apps
    caches = on_app.extensions['chargegap_caches']
    client = on_app.test_client()
    client.get('/api/locations?limit=1&charger_type=07')
    before = caches['locations'].stats()['bytes']
    for _ in range(2):
        client.get('/api/locations?limit=1000&charger_type=07')
    assert caches['locations'].stats()['bytes'] == before
    assert caches['locations'].stats()['entries'] == 1


def test_response_size_growth_is_negligible(apps, store, monkeypatch):
    on_app, off_app = apps
    path = '/api/locations?limit=1000&bbox=127.3,36.25,127.5,36.45'
    on = len(on_app.test_client().get(path).get_data())
    with monkeypatch.context() as patch:
        patch.setattr(store, 'coordinate_flags', lambda unfiltered_table=None: {})
        off = len(off_app.test_client().get(path).get_data())
    # Daejeon has the densest flagged stacks; even here growth stays small. Rule text ≈ 0.6 KB.
    assert on - off < 0.03 * off


def test_snapshot_frame_is_not_modified(app):
    """The flag is computed beside the snapshot; the charger frame (and so every statistic) is untouched."""
    import hashlib
    from chargegap_api.data import DataStore
    store = DataStore(app.config['PROJECT_ROOT'])
    digest = lambda: hashlib.sha256(pd.util.hash_pandas_object(store.chargers, index=True).values.tobytes()).hexdigest()
    columns, before = list(store.chargers.columns), digest()
    flags = store.coordinate_flags()
    assert len(flags) == 644
    assert list(store.chargers.columns) == columns and digest() == before

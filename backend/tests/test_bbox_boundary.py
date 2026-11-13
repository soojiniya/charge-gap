"""bbox boundaries (N-2): the map now sends a view bbox rounded *outward* to 5 decimals.

* High-precision bbox values are accepted and give the same result as an equivalent request.
* Boundaries are inclusive: a station exactly on any edge is returned by /api/locations and
  counted in /api/locations/grid matched, so a bbox that just covers the screen never drops it.
* A bbox shrunk inward by the old 3-decimal rounding (≤ 0.0005°) can miss an edge station;
  the outward 5-decimal cover of the same view never does.
"""
import math

import pytest

FILTERS = [{}, {'deletion': 'not_deleted'}, {'charger_type': '02'}]


def q(params):
    return '&'.join(f'{k}={v}' for k, v in params.items())


def locations(client, bbox, filters, limit=1000):
    r = client.get(f"/api/locations?bbox={','.join(map(str, bbox))}&limit={limit}" + (f'&{q(filters)}' if filters else ''))
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def cover(w, s, e, n, decimals=5):
    """Same rule as frontend/src/components/geo/bbox.ts coverBBox."""
    k = 10 ** decimals
    return (math.floor(w * k + 1e-6) / k, math.floor(s * k + 1e-6) / k, math.ceil(e * k - 1e-6) / k, math.ceil(n * k - 1e-6) / k)


@pytest.mark.parametrize('filters', FILTERS)
def test_station_on_each_edge_is_included(client, filters):
    rows = locations(client, (126.97, 37.55, 126.99, 37.57), filters)['data']
    assert rows, 'fixture area must contain stations'
    s = rows[len(rows) // 2]
    lat, lng = s['latitude'], s['longitude']
    # The station lies exactly on the west / east / south / north edge of a tiny bbox.
    for bbox in [(lng, lat - 0.001, lng + 0.001, lat + 0.001), (lng - 0.001, lat - 0.001, lng, lat + 0.001),
                 (lng - 0.001, lat, lng + 0.001, lat + 0.001), (lng - 0.001, lat - 0.001, lng + 0.001, lat)]:
        ids = {r['station_id'] for r in locations(client, bbox, filters)['data']}
        assert s['station_id'] in ids, bbox
        g = client.get(f"/api/locations/grid?bbox={','.join(map(str, bbox))}&zoom=15" + (f'&{q(filters)}' if filters else '')).get_json()
        assert g['meta']['matched']['station_count'] == len(ids)


def test_high_precision_bbox_is_accepted_and_consistent(client):
    a = locations(client, (126.97, 37.55, 126.99, 37.57), {}, limit=1)
    b = locations(client, (126.970000, 37.5500000, 126.99000, 37.570000), {}, limit=1)
    c = locations(client, (126.96999, 37.54999, 126.99001, 37.57001), {}, limit=1)
    assert a['meta']['pagination']['total_items'] == b['meta']['pagination']['total_items']
    assert c['meta']['pagination']['total_items'] >= a['meta']['pagination']['total_items']


def test_outward_cover_never_misses_edge_stations_but_old_rounding_could(client):
    """Views whose true edge sits just outside a station: old Math.round(…,3) could cut the station off."""
    rows = locations(client, (126.95, 37.54, 127.0, 37.58), {})['data']
    missed_old = 0
    for s in rows[:60]:
        lat, lng = s['latitude'], s['longitude']
        # True view: the station is 0.0003° inside the west edge.
        w, so, e, n = lng - 0.0003, lat - 0.002, lng + 0.004, lat + 0.002
        new_ids = {r['station_id'] for r in locations(client, cover(w, so, e, n), {})['data']}
        assert s['station_id'] in new_ids
        old = tuple(round(v * 1000) / 1000 for v in (w, so, e, n))
        if s['station_id'] not in {r['station_id'] for r in locations(client, old, {})['data']}:
            missed_old += 1
    assert missed_old > 0, 'the case must exercise the old inward rounding'


def test_cover_rule_contains_the_view_and_adds_at_most_one_unit():
    for v in [(126.978123456, 37.566543219, 126.99887766, 37.5711), (126.97800000000001, 37.5, 127.0, 37.6),
              (-180.0, -90.0, 180.0, 90.0)]:
        c = cover(*v)
        assert c[0] <= v[0] and c[1] <= v[1] and c[2] >= v[2] and c[3] >= v[3]
        assert max(v[0] - c[0], v[1] - c[1], c[2] - v[2], c[3] - v[3]) <= 1e-5 + 1e-12

"""/api/locations/grid: every station in the view is counted (map clusters at zoom 11–15).

Checked three ways:
  * request validation and compatibility (existing /api/locations unchanged);
  * the same bbox's /api/locations rows, re-bucketed here, give exactly the same cells;
  * an independent recomputation from the raw CSV (filters → representative coordinate →
    cell) gives the same station and charger counts per cell.
"""
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from chargegap_api.routes import GRID_CELL_PX, grid_cell_degrees

BBOXES = [
    ((126.4, 37.0, 127.6, 37.9), 11),   # 수도권 (이전 보고서의 42,132곳 예시)
    ((126.1, 33.1, 127.0, 33.6), 12),   # 제주
    ((127.3, 36.25, 127.5, 36.45), 13),  # 대전
    ((129.0, 35.1, 129.1, 35.2), 15),   # 부산 도심
]
FILTERS = [
    {},
    {'region_code': '11'},
    {'region_code': '50'},
    {'charger_type': '02'},
    {'deletion': 'deleted'},
    {'deletion': 'not_deleted', 'charger_type': '04'},
    {'operator_id': 'ME'},
    {'region_code': '41', 'charger_type': '04', 'deletion': 'not_deleted'},
]


def query(params):
    return '&'.join(f'{k}={v}' for k, v in params.items())


def grid(client, bbox, zoom, filters):
    r = client.get('/api/locations/grid?' + query({**filters, 'bbox': ','.join(map(str, bbox)), 'zoom': zoom}))
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def all_locations(client, bbox, filters):
    rows, page = [], 1
    while True:
        j = client.get('/api/locations?' + query({**filters, 'bbox': ','.join(repr(v) for v in bbox), 'limit': 1000, 'page': page})).get_json()
        rows += j['data']
        if not j['meta']['pagination']['has_next']:
            return rows, j['meta']
        page += 1


@pytest.fixture(scope='session')
def raw():
    path = Path(__file__).resolve().parents[2] / 'data/processed/charger_info_clean.csv'
    frame = pd.read_csv(path, usecols=['statId', 'chgerId', 'zcode', 'chgerType', 'busiId', 'delYn', 'lat', 'lng'], dtype=str, keep_default_na=False)
    for c in ['statId', 'chgerId', 'zcode', 'chgerType', 'busiId', 'delYn']:
        frame[c] = frame[c].str.strip()
    frame['la'] = pd.to_numeric(frame.lat, errors='coerce')
    frame['lo'] = pd.to_numeric(frame.lng, errors='coerce')
    return frame


def raw_cells(raw, bbox, zoom, filters):
    """Independent re-implementation from the CSV (does not use DataStore/routes)."""
    f = raw
    if filters.get('region_code'): f = f[f.zcode == filters['region_code']]
    if filters.get('charger_type'): f = f[f.chgerType == filters['charger_type']]
    if filters.get('operator_id'): f = f[f.busiId == filters['operator_id']]
    if filters.get('deletion') == 'deleted': f = f[f.delYn == 'Y']
    if filters.get('deletion') == 'not_deleted': f = f[f.delYn == 'N']
    chargers = f.groupby('statId').size()
    valid = f[f.la.between(33, 39.5) & f.lo.between(124, 132)]
    rep = valid.sort_values(['delYn', 'chgerId'], kind='stable').drop_duplicates('statId').set_index('statId')
    rep = rep.assign(chargers=chargers.reindex(rep.index).to_numpy())
    dlat, dlng, _ = grid_cell_degrees(zoom)
    w, s, e, n = bbox
    ix = np.floor(rep.lo / dlng).astype(int)
    iy = np.floor(rep.la / dlat).astype(int)
    inside = ix.between(math.floor(w / dlng), math.floor(e / dlng)) & iy.between(math.floor(s / dlat), math.floor(n / dlat))
    sel = rep[inside].assign(ix=ix[inside], iy=iy[inside])
    exact = rep[rep.lo.between(w, e) & rep.la.between(s, n)]
    cells = {(int(a), int(b)): (len(g), int(g.chargers.sum())) for (a, b), g in sel.groupby(['ix', 'iy'])}
    return cells, len(exact), int(exact.chargers.sum())


def test_validation_and_compatibility(client):
    base = '/api/locations/grid?'
    for q, param in [('zoom=11', 'bbox'), ('bbox=126,37,127,38', 'zoom'), ('bbox=126,37,127,38&zoom=10', 'zoom'),
                     ('bbox=126,37,127,38&zoom=16', 'zoom'), ('bbox=126,37,127,38&zoom=12&page=1', 'page'),
                     ('bbox=124,33,132,39.5&zoom=11', 'bbox'), ('bbox=127,37,126,38&zoom=11', 'bbox'),
                     ('bbox=126,37,127,38&zoom=12&region_code=99', 'region_code')]:
        r = client.get(base + q)
        assert r.status_code == 400, q
        assert r.get_json()['error']['parameter'] == param, q
    # existing endpoint keeps its contract
    j = client.get('/api/locations?bbox=126.4,37.0,127.6,37.9&limit=1000').get_json()
    assert len(j['data']) == 1000 and j['meta']['pagination']['total_items'] == 42132


@pytest.mark.parametrize('bbox,zoom', BBOXES)
@pytest.mark.parametrize('filters', FILTERS, ids=lambda f: query(f) or 'none')
def test_grid_matches_locations_and_raw_csv(client, raw, bbox, zoom, filters):
    j = grid(client, bbox, zoom, filters)
    cells = {tuple(c['cell']): c for c in j['data']}
    meta = j['meta']
    # 1) matched = same bbox in /api/locations
    _, loc_meta = all_locations(client, bbox, filters)
    assert meta['matched'] == loc_meta['matched']
    # 2) cells = /api/locations rows of the cell-snapped bbox, bucketed with the same grid
    snapped = meta['grid']['snapped_bbox']
    dlat, dlng = meta['grid']['cell_degrees']['lat'], meta['grid']['cell_degrees']['lng']
    pad = 1e-9
    rows, _ = all_locations(client, (snapped[0] - pad, snapped[1] - pad, snapped[2] + pad, snapped[3] + pad), filters)
    expect = {}
    w, s, e, n = bbox
    for r in rows:
        key = (math.floor(r['longitude'] / dlng), math.floor(r['latitude'] / dlat))
        if not (math.floor(w / dlng) <= key[0] <= math.floor(e / dlng) and math.floor(s / dlat) <= key[1] <= math.floor(n / dlat)):
            continue
        expect.setdefault(key, []).append(r)
    assert set(cells) == set(expect)
    for key, members in expect.items():
        c = cells[key]
        assert c['station_count'] == len(members)
        for f in ['charger_count', 'not_deleted_charger_count', 'deleted_charger_count']:
            assert c[f] == sum(m[f] for m in members)
        assert abs(c['latitude'] - sum(m['latitude'] for m in members) / len(members)) < 1e-6
        assert abs(c['longitude'] - sum(m['longitude'] for m in members) / len(members)) < 1e-6
        assert abs(c['south'] - min(m['latitude'] for m in members)) < 1e-6
        assert abs(c['east'] - max(m['longitude'] for m in members)) < 1e-6
        assert (c['station'] == members[0]) if len(members) == 1 else c['station'] is None
    assert meta['grid']['station_count'] == sum(len(v) for v in expect.values())
    assert meta['grid']['cell_count'] == len(cells)
    # 3) independent recomputation from the raw CSV
    raw_c, raw_exact_stations, raw_exact_chargers = raw_cells(raw, bbox, zoom, filters)
    assert {k: (v['station_count'], v['charger_count']) for k, v in cells.items()} == raw_c
    assert (meta['matched']['station_count'], meta['matched']['charger_count']) == (raw_exact_stations, raw_exact_chargers)


def test_tiling_covers_every_station_once(client):
    """Tile all of Korea at zoom 11 with adjacent bboxes aligned to the grid:
    every station with a valid coordinate is counted exactly once."""
    dlat, dlng, _ = grid_cell_degrees(11)
    total_stations = total_chargers = 0
    lng_tiles = np.arange(math.floor(124 / dlng), math.floor(132 / dlng) + 1, 150)
    lat_tiles = np.arange(math.floor(33 / dlat), math.floor(39.5 / dlat) + 1, 150)
    for x0 in lng_tiles:
        for y0 in lat_tiles:
            # inner bbox strictly inside cells x0..x0+149, y0..y0+149
            bbox = ((x0 + 1e-6) * dlng, (y0 + 1e-6) * dlat, (x0 + 150 - 1e-6) * dlng, (y0 + 150 - 1e-6) * dlat)
            j = grid(client, tuple(round(v, 9) for v in bbox), 11, {})
            total_stations += j['meta']['grid']['station_count']
            total_chargers += j['meta']['grid']['charger_count']
    loc = client.get('/api/locations?limit=1').get_json()['meta']
    assert total_stations == loc['matched']['station_count']
    assert total_chargers == loc['matched']['charger_count']
    assert total_stations == 101091 - loc['stations_without_valid_coordinates_excluded']


def test_empty_result_and_cell_size(client):
    j = grid(client, (126.4, 37.0, 127.6, 37.9), 11, {'region_code': '50'})  # 제주 필터 + 수도권 화면
    assert j['data'] == [] and j['meta']['matched']['station_count'] == 0 and j['meta']['grid']['cell_count'] == 0
    for zoom in range(11, 16):
        dlat, dlng, meters = grid_cell_degrees(zoom)
        assert meters == GRID_CELL_PX * 2 ** (17 - zoom)

"""/api/charger-output/regions: the Regional Explorer heatmap's 16 per-region requests in one.

Checked three ways:
  * every region's rebuilt response ({data, meta: {...common_meta, filters, matched, count, output_statistics}})
    equals the existing /api/charger-output?{non-region filters}&region_code=R response — data AND meta;
  * the heatmap's six output bands per region, recomputed independently from the raw CSV, are identical;
  * validation, region-ignore policy, response cache, read-only snapshot, and the unchanged /api/charger-output.
"""
import json
import random
import tracemalloc
import urllib.parse

import numpy as np
import pandas as pd
import pytest

from chargegap_api import create_app
from chargegap_api.data import REGIONS_2026

BANDS = [(0, 30), (30, 50), (50, 100), (100, 200), (200, float('inf'))]  # frontend OUTPUT_BANDS / bandIndex


def norm(obj):
    return json.loads(json.dumps(obj, ensure_ascii=False, sort_keys=True))


def rebuild(payload, code):
    common = payload['data']['common_meta']
    region = next(r for r in payload['data']['regions'] if r['region_code'] == code)
    return {'data': region['data'], 'meta': {**common, 'filters': region['filters'], 'matched': region['matched'],
                                              'count': region['count'], 'output_statistics': region['output_statistics']}}


def query(params):
    return urllib.parse.urlencode(sorted((k, v) for k, v in params.items() if v not in (None, '', 'all')))


def filter_combos(truth):
    combos = [{}, {'deletion': 'not_deleted'}, {'deletion': 'deleted'}]
    combos += [{'charger_type': t} for t in sorted(truth.chgerType.str.strip().unique())]
    operators = truth.busiId.str.strip().value_counts()
    combos += [{'operator_id': o} for o in list(operators.index[:6]) + list(operators.index[-4:])]
    rng = random.Random(20261112)
    types = sorted(truth.chgerType.str.strip().unique())
    for _ in range(16):
        combos.append({k: v for k, v in {'charger_type': rng.choice(types + [None]), 'deletion': rng.choice(['all', 'not_deleted', 'deleted']),
                                         'operator_id': rng.choice(list(operators.index[:25]) + [None] * 4)}.items() if v and v != 'all'})
    combos += [{'charger_type': '09'}, {'charger_type': '11', 'operator_id': operators.index[-1]}]  # empty / sparse results
    return combos


def test_rebuilt_region_responses_equal_existing_per_region_requests(client, truth):
    compared = 0
    for filters in filter_combos(truth):
        payload = client.get(f'/api/charger-output/regions?{query(filters)}'.rstrip('?')).get_json()
        assert [r['region_code'] for r in payload['data']['regions']] == list(REGIONS_2026)
        for code in REGIONS_2026:
            existing = client.get(f"/api/charger-output?{query({**filters, 'region_code': code})}").get_json()
            assert norm(rebuild(payload, code)) == norm(existing), (filters, code)
            compared += 1
    assert compared >= 16 * 40


def test_region_in_request_is_ignored_like_the_heatmap_base(client):
    plain = client.get('/api/charger-output/regions?charger_type=02').get_json()
    with_region = client.get('/api/charger-output/regions?charger_type=02&region_code=50').get_json()
    assert norm(plain['data']) == norm(with_region['data'])
    assert with_region['meta']['filters']['region_code'] is None
    assert 'ignored' in with_region['meta']['region_filter_policy']
    assert plain['meta']['region_count'] == 16


def test_heatmap_bands_match_raw_csv(client, truth):
    raw = truth.apply(lambda col: col.str.strip())
    kw = pd.to_numeric(raw.output, errors='coerce')
    band = np.full(len(raw), 5)
    for i, (lo, hi) in enumerate(BANDS):
        band[(kw.gt(0) & kw.ge(lo) & kw.lt(hi)).to_numpy()] = i
    raw = raw.assign(band=band)
    for filters in filter_combos(truth)[:30]:
        mask = pd.Series(True, index=raw.index)
        if filters.get('charger_type'): mask &= raw.chgerType.eq(filters['charger_type'])
        if filters.get('operator_id'): mask &= raw.busiId.eq(filters['operator_id'])
        if filters.get('deletion') == 'not_deleted': mask &= raw.delYn.eq('N')
        if filters.get('deletion') == 'deleted': mask &= raw.delYn.eq('Y')
        sub = raw.loc[mask]
        payload = client.get(f'/api/charger-output/regions?{query(filters)}'.rstrip('?')).get_json()
        for region in payload['data']['regions']:
            got = [0] * 6
            for r in region['data']:
                k = r['output_kw']
                i = 5 if r['value_status'] != 'positive_numeric' or k is None else next(j for j, (lo, hi) in enumerate(BANDS) if lo <= k < hi)
                got[i] += r['charger_count']
            here = sub.loc[sub.zcode.eq(region['region_code'])]
            expected = [int(v) for v in here.band.value_counts().reindex(range(6), fill_value=0).values]
            assert got == expected, (filters, region['region_code'])
            assert region['matched']['charger_count'] == len(here)
            assert region['matched']['station_count'] == here.statId.nunique()


@pytest.mark.parametrize('bad', ['bogus=1', 'region_code=99', 'charger_type=99', 'deletion=maybe', 'operator_id=ZZZZ', 'charger_type=', 'deletion=all&deletion=deleted'])
def test_validation_is_the_same_as_other_charger_endpoints(client, bad):
    response = client.get(f'/api/charger-output/regions?{bad}')
    assert response.status_code == 400
    assert response.get_json()['error']['code'] == 'INVALID_PARAMETER'


def test_existing_charger_output_endpoint_is_unchanged(client):
    body = client.get('/api/charger-output?region_code=11').get_json()
    assert set(body['meta']) >= {'output_statistics', 'output_note', 'matched', 'count', 'filters'}
    assert body['meta']['filters']['region_code'] == '11'
    assert isinstance(body['data'], list) and body['data'] and 'output_raw' in body['data'][0]


def test_response_is_cached_and_snapshot_untouched():
    app = create_app({'TESTING': True})
    client = app.test_client()
    store = app.extensions['chargegap_data']
    before = pd.util.hash_pandas_object(store.chargers, index=True).sum()
    first = client.get('/api/charger-output/regions?deletion=not_deleted').data
    responses = app.extensions['chargegap_caches']['responses']
    hits = responses.hits
    assert client.get('/api/charger-output/regions?deletion=not_deleted').data == first
    assert responses.hits == hits + 1
    assert pd.util.hash_pandas_object(store.chargers, index=True).sum() == before


def test_transient_memory_is_not_above_the_existing_all_region_output_request():
    """The one request selects once (like /api/charger-output without region) and makes no per-region frame copies."""
    app = create_app({'TESTING': True, 'RESPONSE_CACHE_BYTES': 0})
    client = app.test_client()
    for q in ['', 'deletion=not_deleted', 'charger_type=02']:
        tracemalloc.start(); client.get(f'/api/charger-output?{q}'); existing = tracemalloc.get_traced_memory()[1]; tracemalloc.stop()
        tracemalloc.start(); client.get(f'/api/charger-output/regions?{q}'); merged = tracemalloc.get_traced_memory()[1]; tracemalloc.stop()
        assert merged <= existing * 1.15 + 4 * 2**20, (q, existing, merged)

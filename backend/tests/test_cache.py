"""Response and /locations caches: identical results, hit/miss/eviction, byte bounds, CORS,
plus the lean column set of the charger snapshot."""
import hashlib
import itertools
from pathlib import Path

import pandas as pd
import pytest
from werkzeug.datastructures import MultiDict

from chargegap_api import create_app
from chargegap_api.cache import ByteLRU, request_key

ORIGIN = 'https://frontend.example'


@pytest.fixture(scope='module')
def store(app):
    return app.extensions['chargegap_data']


def make_app(store, response_bytes=16 * 1024 * 1024, locations_bytes=48 * 1024 * 1024):
    return create_app({'TESTING': True, 'DATA_STORE': store, 'RESPONSE_CACHE_BYTES': response_bytes,
                       'LOCATIONS_CACHE_BYTES': locations_bytes, 'CORS_ORIGINS': [ORIGIN]})


def caches(app):
    return app.extensions['chargegap_caches']


# ---------------------------------------------------------------- ByteLRU unit behaviour
def test_hit_miss_and_lru_eviction_by_bytes():
    c = ByteLRU(10, 't')
    assert c.get('a') is None and c.misses == 1
    assert c.put('a', 'A', 4) and c.put('b', 'B', 4)
    assert c.get('a') == 'A' and c.hits == 1          # a becomes most recently used
    assert c.put('c', 'C', 4)                          # 12 > 10: evicts least recently used (b)
    assert c.keys() == ['a', 'c'] and c.get('b') is None
    assert c.stats()['bytes'] == 8 and c.evictions == 1


def test_oversized_entries_are_rejected_and_replacing_a_key_keeps_accounting():
    c = ByteLRU(10, 't')
    assert not c.put('big', 'X', 11) and c.rejected == 1 and c.keys() == []
    c.put('k', 1, 6); c.put('k', 2, 3)
    assert c.get('k') == 2 and c.stats()['bytes'] == 3 and c.stats()['entries'] == 1


def test_zero_budget_disables_the_cache():
    c = ByteLRU(0, 't')
    assert not c.enabled and not c.put('a', 'A', 1) and c.get('a') is None


def test_request_key_covers_every_parameter_and_ignores_order_only():
    a = request_key('/api/x', MultiDict([('page', '2'), ('limit', '50')]))
    b = request_key('/api/x', MultiDict([('limit', '50'), ('page', '2')]))
    assert a == b
    assert a != request_key('/api/x', MultiDict([('limit', '50'), ('page', '3')]))
    assert a != request_key('/api/y', MultiDict([('limit', '50'), ('page', '2')]))
    assert request_key('/api/x', MultiDict([('a', '1'), ('a', '2')])) != request_key('/api/x', MultiDict([('a', '1')]))


# ---------------------------------------------------------------- identical responses
FILTERS = [dict(zip(['region_code', 'charger_type', 'deletion', 'operator_id'], combo)) for combo in itertools.product(
    [None, '11', '50'], [None, '02', '09'], [None, 'not_deleted', 'deleted'], [None, 'PI', 'IN'])]


def url(path, **params):
    query = '&'.join(f'{k}={v}' for k, v in params.items() if v is not None)
    return f'{path}?{query}' if query else path


def responses(client, urls):
    return [(r.status_code, r.content_type, hashlib.sha256(r.data).hexdigest()) for r in map(client.get, urls)]


def test_cached_responses_equal_uncached_for_all_filter_combinations(store):
    urls = [url(f'/api/{ep}', **f) for f in FILTERS for ep in
            ['overview', 'charger-regions', 'charger-types', 'charger-output', 'station-size-distribution', 'operators']]
    urls += ['/api/operators?page=2&limit=50', '/api/operators?limit=50&page=2', '/api/growth?year_from=2015',
             '/api/ev-registration?region_code=12', '/api/charts?chart_id=3', '/api/overview?ev_region_code=12']
    plain = make_app(store, 0, 0).test_client()
    cached_app = make_app(store)
    cached = cached_app.test_client()
    expected = responses(plain, urls)
    assert responses(cached, urls) == expected            # misses
    hits_before = caches(cached_app)['responses'].hits
    assert responses(cached, urls) == expected            # hits
    assert caches(cached_app)['responses'].hits - hits_before == len(urls)


LOCATION_VARIANTS = ['limit=20', 'limit=200&page=3', 'bbox=126.9,37.5,127.1,37.6&limit=1000',
                     'page=2&limit=1000&bbox=126.9,37.5,127.1,37.6', 'bbox=126.1,33.1,127.0,33.6&limit=1000',
                     'bbox=125.0,34.0,125.1,34.1', 'page=9999&limit=1000']


def test_locations_bbox_pagination_and_representatives_equal_uncached(store):
    urls = [url('/api/locations', **f) + ('&' if any(f.values()) else '?') + v
            for f in FILTERS[::3] for v in LOCATION_VARIANTS]
    plain = make_app(store, 0, 0).test_client()
    cached_app = make_app(store)
    cached = cached_app.test_client()
    expected = responses(plain, urls)
    assert responses(cached, urls) == expected
    assert responses(cached, urls[::-1]) == expected[::-1]
    stats = caches(cached_app)['locations'].stats()
    assert stats['hits'] > 0 and stats['bytes'] <= stats['max_bytes']


def test_eviction_under_small_budgets_keeps_results_identical(store):
    from chargegap_api.routes import table_bytes
    shared = {id(store.chargers[c].cat.categories) for c in store.chargers.select_dtypes('category')}
    jeju = store.locations(store.select({'region_code': '50', 'charger_type': None, 'deletion': 'all', 'operator_id': None}))[0]
    budget = table_bytes(jeju, shared) + 1   # room for the Jeju table only: the next table evicts it
    urls = [url('/api/charger-types', **f) for f in FILTERS[:20]] + \
           [url('/api/locations', region_code=r) + '&limit=20' for r in ['50', '36', '50', '36']]
    plain = make_app(store, 0, 0).test_client()
    tiny_app = make_app(store, response_bytes=12 * 1024, locations_bytes=budget)
    tiny = tiny_app.test_client()
    expected = responses(plain, urls)
    assert responses(tiny, urls) == expected and responses(tiny, urls) == expected
    r, loc = caches(tiny_app)['responses'].stats(), caches(tiny_app)['locations'].stats()
    assert r['evictions'] > 0 and r['bytes'] <= r['max_bytes']
    assert loc['evictions'] > 0 and loc['entries'] == 1 and loc['bytes'] <= loc['max_bytes']
    # The nationwide table is larger than this budget: served correctly, never stored.
    assert responses(tiny, ['/api/locations?limit=5']) == responses(plain, ['/api/locations?limit=5'])
    assert caches(tiny_app)['locations'].rejected >= 1


def test_location_cache_accounting_is_bounded_and_excludes_shared_dictionaries(store):
    from chargegap_api.routes import table_bytes
    shared = {id(store.chargers[c].cat.categories) for c in store.chargers.select_dtypes('category')}
    table = store.locations(store.chargers)[0]
    deep = int(table.memory_usage(index=True, deep=True).sum())
    accounted = table_bytes(table, shared)
    # Shared station-name/address dictionaries are not double counted, but the estimate stays
    # above the table's own (non-shared) memory, and the nationwide table fits the 48 MiB budget.
    assert accounted < deep and accounted < 48 * 1024 * 1024
    own = deep - sum(int(table[c].cat.categories.memory_usage(deep=True)) for c in table.select_dtypes('category')
                     if id(table[c].cat.categories) in shared)
    assert accounted >= own


def test_errors_are_never_cached(store):
    cached_app = make_app(store)
    client = cached_app.test_client()
    bad = ['/api/overview?region_code=99', '/api/overview?foo=1', '/api/operators?page=0', '/api/locations?limit=1001',
           '/api/overview?region_code=11&region_code=12', '/api/charger-types?operator_id=ZZ']
    for _ in range(2):
        assert all(client.get(u).status_code == 400 for u in bad)
    assert caches(cached_app)['responses'].stats()['entries'] == 0
    assert caches(cached_app)['locations'].stats()['entries'] == 0


def test_cors_headers_are_per_request_on_cache_hits(store):
    client = make_app(store).test_client()
    first = client.get('/api/growth', headers={'Origin': ORIGIN})
    assert first.headers['Access-Control-Allow-Origin'] == ORIGIN
    hit_other = client.get('/api/growth', headers={'Origin': 'https://evil.example'})
    hit_none = client.get('/api/growth')
    hit_again = client.get('/api/growth', headers={'Origin': ORIGIN})
    assert 'Access-Control-Allow-Origin' not in hit_other.headers
    assert 'Access-Control-Allow-Origin' not in hit_none.headers
    assert hit_again.headers['Access-Control-Allow-Origin'] == ORIGIN and 'Origin' in hit_again.headers['Vary']
    assert first.data == hit_other.data == hit_none.data == hit_again.data
    assert hit_none.headers['X-Content-Type-Options'] == 'nosniff'
    assert hit_none.content_type == first.content_type == 'application/json'


def test_cached_location_tables_are_never_modified(store):
    cached_app = make_app(store)
    client = cached_app.test_client()
    client.get('/api/locations?limit=1')
    (table, _, _), = [entry for entry in [caches(cached_app)['locations'].get(k) for k in caches(cached_app)['locations'].keys()]]
    before = hashlib.sha256(pd.util.hash_pandas_object(table, index=True).values.tobytes()).hexdigest()
    for v in LOCATION_VARIANTS + ['bbox=-180,-90,180,90&limit=1000&page=3']:
        assert client.get('/api/locations?' + v).status_code == 200
    after = hashlib.sha256(pd.util.hash_pandas_object(table, index=True).values.tobytes()).hexdigest()
    assert before == after


# ---------------------------------------------------------------- lean snapshot columns
def test_snapshot_keeps_only_used_columns_with_identical_values(store):
    assert set(store.chargers.columns) == {'statId', 'chgerId', 'statNm', 'chgerType', 'addr', 'zcode', 'delYn',
                                           'busiId', 'busiNm', 'output', '_lat', '_lng', '_output_kw'}
    raw = pd.read_csv(Path(store.root) / 'data/processed/charger_info_clean.csv', usecols=['lat', 'lng', '_fetched_at'],
                      dtype=str, keep_default_na=False)
    raw = raw.apply(lambda col: col.str.strip())
    assert store.snapshot_start == raw._fetched_at.min() and store.snapshot_end == raw._fetched_at.max()
    for column, source in [('_lat', raw.lat), ('_lng', raw.lng)]:
        expected = pd.to_numeric(source, errors='coerce').to_numpy()
        assert (pd.isna(expected) == store.chargers[column].isna().to_numpy()).all()
        assert (store.chargers[column].fillna(0).to_numpy() == pd.Series(expected).fillna(0).to_numpy()).all()

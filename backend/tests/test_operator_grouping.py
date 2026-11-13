"""Operator grouping rule (OPERATOR_KEY = busiId): one operator per operator ID, display name from the
source institution name (bnm), and every operator-name variant (busiNm) kept with its charger count.

The rule is the same for /api/operators, the regional HHI and (via scripts/verify_python_charts_2026.py)
the Python treemap PY10. These tests recompute it independently from the raw snapshot.
"""
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope='module')
def raw():
    frame = pd.read_csv(ROOT / 'data/processed/charger_info_clean.csv', dtype=str, keep_default_na=False,
                        usecols=['busiId', 'bnm', 'busiNm', 'zcode', 'delYn', 'chgerType', 'output', 'statId'])
    return frame.apply(lambda column: column.str.strip())


def hhi(counts):
    total = counts.sum()
    return float(((counts / total) ** 2).sum() * 10000) if total else None


def test_snapshot_identity_premises(raw):
    """The ID rule relies on one institution name per ID. If a new snapshot breaks this, fail loudly."""
    assert raw.busiId.nunique() == 144
    assert raw.groupby(['busiId', 'busiNm']).ngroups == 342
    assert raw.groupby('busiId').bnm.nunique().max() == 1
    assert raw.groupby('bnm').busiId.nunique().max() == 1
    assert (raw.bnm != '').all()


def test_operators_rows_match_raw(client, raw, app):
    rows = []
    page = 1
    while True:
        body = client.get('/api/operators', query_string={'page': page, 'limit': 200}).get_json()
        rows += body['data']
        if not body['meta']['pagination']['has_next']:
            break
        page += 1
    expected = raw.groupby('busiId').size()
    assert {r['operator_id']: r['charger_count'] for r in rows} == {k: int(v) for k, v in expected.items()}
    names = raw.groupby('busiId').bnm.first()
    assert all(r['operator_name'] == names[r['operator_id']] for r in rows)
    variants = raw.groupby(['busiId', 'busiNm']).size()
    for r in rows:
        assert sum(v['charger_count'] for v in r['name_variants']) == r['charger_count']
        assert {v['name']: v['charger_count'] for v in r['name_variants']} == \
            {k: int(v) for k, v in variants.loc[r['operator_id']].items()}
        counts = [v['charger_count'] for v in r['name_variants']]
        assert counts == sorted(counts, reverse=True)
    order = [(-r['charger_count'], r['operator_id']) for r in rows]
    assert order == sorted(order)
    top20 = sum(r['charger_count'] for r in rows[:20]) / len(raw) * 100
    assert top20 == pytest.approx(89.4, abs=0.05)
    assert 'busiId' in body['meta']['grouping']


@pytest.mark.parametrize('query', [{}, {'deletion': 'not_deleted'}, {'charger_type': '04'}, {'region_code': '36'},
                                   {'operator_id': 'PW'}])
def test_operator_rows_follow_filters(client, raw, query):
    frame = raw
    for parameter, column in [('region_code', 'zcode'), ('charger_type', 'chgerType'), ('operator_id', 'busiId')]:
        if parameter in query:
            frame = frame[frame[column] == query[parameter]]
    if query.get('deletion') == 'not_deleted':
        frame = frame[frame.delYn == 'N']
    body = client.get('/api/operators', query_string={**query, 'limit': 200}).get_json()
    assert body['meta']['pagination']['total_items'] == frame.busiId.nunique()
    assert sum(r['charger_count'] for r in body['data']) == len(frame)


def test_hhi_by_operator_id(client, raw):
    data = client.get('/api/regional-disparity').get_json()['data']
    national = data['national']['operator_hhi']
    assert national['operator_count'] == 144
    assert national['value'] == pytest.approx(hhi(raw.groupby('busiId').size()))
    assert round(national['value']) == 811
    by_region = {r['region_code']: r['metrics']['operator_hhi'] for r in data['regions']}
    for code, part in raw.groupby('zcode'):
        assert by_region[code]['value'] == pytest.approx(hhi(part.groupby('busiId').size()))
        assert by_region[code]['operator_count'] == part.busiId.nunique()
    assert round(by_region['36']['value']) == 1858 and by_region['36']['rank'] == 1
    assert round(by_region['47']['value']) == 636 and by_region['47']['rank'] == 16


def test_other_disparity_metrics_do_not_depend_on_operator_names(client, raw):
    """High-output share, chargers per station, type mix and deletion share are recomputed from the raw rows."""
    data = client.get('/api/regional-disparity').get_json()['data']
    for row in data['regions']:
        part = raw[raw.zcode == row['region_code']]
        output = pd.to_numeric(part.output, errors='coerce')
        m = row['metrics']
        assert m['high_100kw']['numerator'] == int((output >= 100).sum())
        assert m['high_100kw']['denominator'] == int((output > 0).sum())
        assert m['chargers_per_station']['value'] == pytest.approx(len(part) / part.statId.nunique())
        assert m['deletion_share']['numerator'] == int((part.delYn == 'Y').sum())
        assert {t['charger_type_code']: t['charger_count'] for t in m['type_mix'] if t['charger_count']} == \
            part.chgerType.value_counts().to_dict()

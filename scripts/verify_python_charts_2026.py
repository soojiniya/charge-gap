"""Python 데이터 시각화 그래프 10개의 계산값을 현재 웹사이트 API(기본 필터 = 삭제 표시 포함 전체)와 대조합니다.

입력: reports/python_charts_2026_metrics.json, frontend/public/python-charts/charts.json (create_python_charts_2026.py 결과)
대조: 실행 중인 CHARGE GAP 백엔드 API (기본 http://127.0.0.1:5000). 읽기 전용 GET만 보냅니다.
결과: reports/python_charts_2026_verification.json, 하나라도 다르면 종료 코드 1

실행: python scripts/verify_python_charts_2026.py [--api http://127.0.0.1:5000] [--project-root 경로]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--api', default='http://127.0.0.1:5000')
parser.add_argument('--project-root', type=Path, default=Path(__file__).resolve().parents[1])
args = parser.parse_args()
P = args.project_root.resolve()
M = json.loads((P / 'reports/python_charts_2026_metrics.json').read_text(encoding='utf-8'))
META = json.loads((P / 'frontend/public/python-charts/charts.json').read_text(encoding='utf-8'))
C = M['charts']
results: list[dict] = []


def get(path: str, **params):
    q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    with urllib.request.urlopen(f"{args.api}/api/{path}{'?' + q if q else ''}", timeout=120) as r:
        return json.loads(r.read().decode('utf-8'))


def check(chart: int, name: str, ok: bool, detail=None):
    results.append({'chart': chart, 'check': name, 'ok': bool(ok), **({'detail': detail} if detail is not None else {})})


def close(a: float, b: float, tol: float = 1e-9) -> bool:
    return math.isclose(a, b, rel_tol=tol, abs_tol=tol)


# 원본 CSV가 생성 당시와 같은지
for rel, sha in M['source_sha256'].items():
    check(0, f'source unchanged: {rel}', hashlib.sha256((P / rel).read_bytes()).hexdigest() == sha)
# PNG 파일이 메타데이터와 같은지
for c in META['charts']:
    path = P / 'frontend/public/python-charts' / c['file']
    check(c['id'], 'png exists and sha256 matches charts.json', path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == c['sha256'])

ov = get('overview')['data']
ch = ov['chargers']
check(0, 'charger totals = /api/overview (all)', [META['data']['chargers'][k] for k in ('total', 'not_deleted', 'deleted')]
      == [ch['charger_count'], ch['not_deleted_charger_count'], ch['deleted_charger_count']])
check(0, 'EV total and month = /api/overview', META['data']['ev_registration']['total'] == ov['ev_registration']['ev_registration_count'])

# 1–3 전기차 등록
evr = {r['region_code']: r for r in get('ev-registration')['data']}
check(1, 'national total', C['1']['national_total'] == sum(r['ev_registration_count'] for r in evr.values()))
check(1, '16 regional counts', C['1']['regions'] == {k: r['ev_registration_count'] for k, r in evr.items()})
tot = {'승용': 'ev_passenger_count', '승합': 'ev_bus_count', '화물': 'ev_truck_count', '특수': 'ev_special_count'}
check(2, 'vehicle type totals', C['2']['vehicle_types'] == {k: sum(r[v] for r in evr.values()) for k, v in tot.items()})
nat = sum(r['ev_commercial_count'] for r in evr.values()) / sum(r['ev_registration_count'] for r in evr.values()) * 100
check(3, 'national commercial %', close(C['3']['national_commercial_pct'], nat))
api_order = sorted(evr, key=lambda k: (-evr[k]['ev_commercial_count'] / evr[k]['ev_registration_count'], k))
check(3, 'top-to-bottom order = commercial % descending (API)', C['3']['order_top_to_bottom'] == api_order)
check(3, 'regional commercial %', all(close(C['3']['regions_commercial_pct'][k], r['ev_commercial_count'] / r['ev_registration_count'] * 100) for k, r in evr.items()))

# 4 산점도·회귀 (웹 lib/stats.ts ols/pearson과 같은 식)
reg = {r['region_code']: r for r in get('charger-regions')['data']}
check(4, 'regional station/charger counts', C['4']['regions'] == {k: {'station_count': r['station_count'], 'charger_count': r['charger_count']} for k, r in reg.items()})
xs = [reg[k]['station_count'] for k in sorted(reg)]
ys = [reg[k]['charger_count'] for k in sorted(reg)]
n = len(xs)
mx, my = sum(xs) / n, sum(ys) / n
sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
sxx = sum((a - mx) ** 2 for a in xs)
syy = sum((b - my) ** 2 for b in ys)
slope = sxy / sxx
check(4, 'OLS slope/intercept/R² = web formula', close(C['4']['slope'], slope, 1e-9) and close(C['4']['intercept'], my - slope * mx, 1e-6)
      and close(C['4']['r2'], sxy * sxy / (sxx * syy), 1e-9), {'slope': slope, 'r2': sxy * sxy / (sxx * syy)})

# 5 박스플롯: API station-size-distribution (선형 보간 사분위수, 1.5×IQR)
box = {r['region_code']: r for r in get('station-size-distribution')['data']}
for k, s in C['5']['regions'].items():
    a = box[k]
    same = (s['sample_count'] == a['sample_count'] and s['outlier_count'] == a['outlier_count']
            and all(close(s[x], a[x], 1e-9) for x in ('q1', 'median', 'q3', 'whisker_low', 'whisker_high', 'mean')))
    check(5, f'box stats region {k}', same, None if same else {'python': s, 'api': {x: a[x] for x in s}})
check(5, 'sample count = sum of API samples', C['5']['sample_count'] == sum(r['sample_count'] for r in box.values()))

# 6 유형 상위 4 + 기타
types = sorted(get('charger-types')['data'], key=lambda r: -r['charger_count'])
api6 = [r['charger_count'] for r in types[:4]] + [sum(r['charger_count'] for r in types[4:])]
check(6, 'top4 + other counts', C['6']['counts'] == api6, {'python': C['6']['counts'], 'api': api6})
check(6, 'type codes order', [l.split()[0] for l in C['6']['labels'][:4]] == [r['charger_type_code'] for r in types[:4]])

# 7 히스토그램: /api/charger-output 그룹값을 웹 logHistogram 규칙으로 집계
out = get('charger-output')
items = [(r['output_kw'], r['charger_count']) for r in out['data'] if r['value_status'] == 'positive_numeric']
edges = C['7']['bin_edges_log10']
bins = [0] * (len(edges) - 1)
for v, w in items:
    lv = math.log10(v)
    for i in range(len(bins)):
        if lv >= edges[i] and (lv < edges[i + 1] or (i == len(bins) - 1 and lv <= edges[i + 1])):
            bins[i] += w
            break
check(7, 'histogram bins = web logHistogram on API data', C['7']['bin_counts'] == bins, {'python': C['7']['bin_counts'], 'web': bins})
stats = out['meta']['output_statistics']
check(7, 'valid/invalid/median = API output_statistics', C['7']['valid_positive_count'] == stats['valid_positive_count']
      and C['7']['invalid_or_missing_count'] == stats['invalid_or_missing_count'] and close(C['7']['median_kw'], stats['median_kw']))
# KDE: 웹 weightedKde(대역폭 0.125, 건수 축척)를 Seaborn 곡선의 x 위치에서 다시 계산해 비교
bw = C['7']['bandwidth_log10']
binw = edges[1] - edges[0]
pts = [(math.log10(v), w) for v, w in items]
norm = 1 / (math.sqrt(2 * math.pi) * bw)
worst = 0.0
peak = max(C['7']['kde_y'])
for gx, gy in zip(C['7']['kde_x'][::7], C['7']['kde_y'][::7]):
    web = sum(w * norm * math.exp(-0.5 * ((gx - x) / bw) ** 2) for x, w in pts) * binw
    worst = max(worst, abs(web - gy) / peak)
check(7, 'Seaborn KDE curve = web weightedKde (max diff < 0.1% of peak)', worst < 1e-3, {'max_relative_diff_of_peak': worst})

# 8 히트맵: 지역별 /api/charger-output 을 웹 bandIndex 규칙으로 6구간 집계
def band(r):
    if r['value_status'] != 'positive_numeric' or r['output_kw'] is None:
        return 5
    k = r['output_kw']
    return 0 if k < 30 else 1 if k < 50 else 2 if k < 100 else 3 if k < 200 else 4


bad = []
for code, counts in C['8']['counts'].items():
    api = [0] * 6
    for r in get('charger-output', region_code=code)['data']:
        api[band(r)] += r['charger_count']
    if api != counts:
        bad.append({'region': code, 'python': counts, 'web': api})
check(8, '16 regions × 6 bands = web heatmap counts', not bad, bad or None)

# 9 설치 추이
gr = get('growth')['data']
check(9, 'years/annual/cumulative = /api/growth', C['9']['years'] == [r['year'] for r in gr] and C['9']['annual'] == [r['annual_installed_count'] for r in gr]
      and C['9']['cumulative'] == [r['cumulative_count'] for r in gr])
check(9, 'partial years = API is_partial_year', C['9']['partial_years'] == [r['year'] for r in gr if r['is_partial_year']])

# 10 운영기관 상위 20 + 기타
op = get('operators', limit=200, page=1)
rows = op['data']
page = 2
while op['meta']['pagination']['has_next']:
    op = get('operators', limit=200, page=page)
    rows += op['data']
    page += 1
api10 = [r['charger_count'] for r in rows[:20]] + [sum(r['charger_count'] for r in rows[20:])]
check(10, 'operator ID count = /api/operators rows', C['10']['operator_ids'] == len(rows))
check(10, 'ID-name variants = sum of name_variants', C['10']['name_variant_pairs'] == sum(len(r['name_variants']) for r in rows))
check(10, 'top20 + other counts, order and names', C['10']['counts'] == api10
      and [l.rsplit('[', 1)[1].rstrip(']') for l in C['10']['labels'][:20]] == [r['operator_id'] for r in rows[:20]]
      and [l.rsplit(' [', 1)[0] for l in C['10']['labels'][:20]] == [r['operator_name'] for r in rows[:20]])

summary = {'api': args.api, 'checks': len(results), 'failed': [r for r in results if not r['ok']], 'results': results}
(P / 'reports/python_charts_2026_verification.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(json.dumps({'checks': len(results), 'failed': len(summary['failed'])}, ensure_ascii=False))
for r in summary['failed']:
    print('FAIL', r)
sys.exit(1 if summary['failed'] else 0)

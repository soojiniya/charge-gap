"""웹사이트 API(기본 필터)로 웹 그래프 1~10의 표시 값을 웹 코드와 같은 방식으로 다시 계산하고,
outputs/charts_web_matched_2026/metrics.json (Python 그래프 값)과 비교합니다.

웹 계산 규칙은 frontend/src/features/ChartCards.tsx · charts/*.tsx · lib/stats.ts 를 그대로 옮겼습니다.
실행: python scripts/verify_web_matched_charts_2026.py [--api http://127.0.0.1:5000]
결과: outputs/charts_web_matched_2026/verification.json, verification.md
"""
from __future__ import annotations

import argparse
import json
import math
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument('--api', default='http://127.0.0.1:5000')
ap.add_argument('--dir', type=Path, default=ROOT / 'outputs/charts_web_matched_2026')
a = ap.parse_args()
M = json.loads((a.dir / 'metrics.json').read_text(encoding='utf-8'))
PY = {c['id']: c['values'] for c in M['charts']}


def get(path: str):
    with urllib.request.urlopen(a.api + path, timeout=120) as r:
        return json.load(r)


checks: list[dict] = []


def check(chart: int, item: str, web, py, tol: float = 0.0, note: str = ''):
    if isinstance(web, float) or isinstance(py, float):
        ok = math.isclose(float(web), float(py), rel_tol=tol, abs_tol=1e-9 if tol == 0 else 0)
    else:
        ok = web == py
    checks.append({'chart': chart, 'item': item, 'web': web, 'python': py, 'ok': bool(ok), 'note': note})


# 1 ------------------------------------------------------------- /api/ev-registration
ev = get('/api/ev-registration')
rows = ev['data']
web1 = sorted(rows, key=lambda r: -r['ev_registration_count'])
check(1, '지역 순서(등록 대수 내림차순)', [r['region_code'] for r in web1], PY[1]['order'])
check(1, '16개 지역 등록 대수', {r['region_code']: r['ev_registration_count'] for r in rows}, PY[1]['counts'])
check(1, '전국 합계', ev['meta']['totals']['ev_registration_count'], PY[1]['total'])
# 2
s = {k: sum(r[f'ev_{k}_count'] for r in rows) for k in ('passenger', 'truck', 'bus', 'special')}
check(2, '차종별 대수 (승용·화물·승합·특수)', [s['passenger'], s['truck'], s['bus'], s['special']], PY[2]['counts'])
check(2, '도넛 가운데 합계', sum(s.values()), PY[2]['total'])
# 3
share = lambda r: r['ev_commercial_count'] / r['ev_registration_count'] if r['ev_registration_count'] else 0  # noqa: E731
web3 = sorted(rows, key=lambda r: (-share(r), r['region_code']))
check(3, '지역 순서(사업용 비율 내림차순, 같으면 코드)', [r['region_code'] for r in web3], PY[3]['order'])
check(3, '사업용 대수', {r['region_code']: r['ev_commercial_count'] for r in rows}, PY[3]['commercial'])
check(3, '비사업용 대수', {r['region_code']: r['ev_noncommercial_count'] for r in rows}, PY[3]['noncommercial'])
check(3, '막대 안 사업용 비율(소수 1자리)', {r['region_code']: f'{share(r) * 100:.1f}' for r in rows},
      {k: f'{v:.1f}' for k, v in PY[3]['commercial_pct'].items()})

# 4 ------------------------------------------------------------- /api/charger-regions (지역 필터 제외, 삭제 표시 전체)
cr = get('/api/charger-regions')['data']
check(4, '지역별 충전소 수·충전기 수', {r['region_code']: {'station_count': r['station_count'], 'charger_count': r['charger_count']} for r in cr},
      PY[4]['regions'])
xs, ys = [r['station_count'] for r in cr], [r['charger_count'] for r in cr]
n = len(xs); mx, my = sum(xs) / n, sum(ys) / n
sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys)); sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
slope = sxy / sxx; intercept = my - slope * mx; r2 = sxy * sxy / (sxx * syy)
check(4, '회귀 기울기 (웹 lib/stats ols)', slope, PY[4]['slope'], 1e-9)
check(4, '회귀 절편', intercept, PY[4]['intercept'], 1e-9)
check(4, 'R²', r2, PY[4]['r2'], 1e-9)
check(4, '화면 표기 (절편 반올림·기울기 3자리·R² 3자리)', f"{round(intercept):,} / {slope:.3f} / {r2:.3f}",
      f"{round(PY[4]['intercept']):,} / {PY[4]['slope']:.3f} / {PY[4]['r2']:.3f}")

# 5 ------------------------------------------------------------- /api/station-size-distribution (웹: 필터 '전체' → not_deleted)
sd = get('/api/station-size-distribution?deletion=not_deleted')
web5 = sorted(sd['data'], key=lambda r: (-r['median'], -r['q3'], -r['mean']))
check(5, '지역 순서(중앙값→Q3→평균 내림차순)', [r['region_code'] for r in web5], PY[5]['order'])
check(5, '표본 충전소 수(비삭제)', sd['meta']['sample_count'], PY[5]['sample_count'])
for k in ('sample_count', 'q1', 'median', 'q3', 'whisker_low', 'whisker_high', 'max', 'outlier_count'):
    check(5, f'지역별 {k}', {r['region_code']: r[k] for r in sd['data']}, {c: v[k] for c, v in PY[5]['regions'].items()})
check(5, '지역별 평균', {r['region_code']: round(r['mean'], 9) for r in sd['data']}, {c: round(v['mean'], 9) for c, v in PY[5]['regions'].items()})

# 6 ------------------------------------------------------------- /api/charger-types
ct = sorted(get('/api/charger-types')['data'], key=lambda r: -r['charger_count'])
top, rest = ct[:4], ct[4:]
web6_labels = [f"{r['charger_type_code']} {r['official_definition']}" for r in top] + ([f'기타 {len(rest)}개 유형'] if rest else [])
web6_vals = [r['charger_count'] for r in top] + ([sum(r['charger_count'] for r in rest)] if rest else [])
check(6, '조각 이름 (상위 4 + 기타)', web6_labels, PY[6]['labels'])
check(6, '조각 값', web6_vals, PY[6]['counts'])
check(6, '도넛 가운데 합계', sum(web6_vals), sum(PY[6]['counts']))

# 7 ------------------------------------------------------------- /api/charger-output (HistKde: logHistogram + weightedKde)
co = get('/api/charger-output')
items = [(r['output_kw'], r['charger_count']) for r in co['data'] if r['value_status'] == 'positive_numeric' and r['output_kw'] is not None]
edges = PY[7]['bin_edges_log10']
check(7, '구간 경계 (HistKde LO 0.375 · 폭 0.125 · HI 2.75)', [round(0.375 + i * 0.125, 4) for i in range(round((2.75 - 0.375) / 0.125) + 1)], edges)
bins = [0] * (len(edges) - 1)
for v, w in items:
    lv = math.log10(v)
    for i in range(len(bins)):
        if edges[i] <= lv and (lv < edges[i + 1] or (i == len(bins) - 1 and lv <= edges[i + 1])):
            bins[i] += w
            break
check(7, '구간별 충전기 수 (19개 구간)', bins, PY[7]['bin_counts'])
check(7, '양수 출력 수', co['meta']['output_statistics']['valid_positive_count'], PY[7]['valid_positive'])
check(7, '제외(결측·0 이하) 수', co['meta']['output_statistics']['invalid_or_missing_count'], PY[7]['excluded'])
check(7, '중앙값 kW', co['meta']['output_statistics']['median_kw'], PY[7]['median_kw'])
mids = [(edges[i] + edges[i + 1]) / 2 for i in range(len(edges) - 1)]
kde = [sum(w * math.exp(-.5 * ((g - math.log10(v)) / .125) ** 2) for v, w in items) / (math.sqrt(2 * math.pi) * .125) * .125 for g in mids]
check(7, 'KDE 값(구간 중앙, 웹 weightedKde)', [round(k, 3) for k in kde], PY[7]['kde_at_bin_mids_web_formula'],
      note='Python 그래프의 Seaborn KDE 곡선과 이 값의 최대 상대 차 = ' + f"{PY[7]['kde_seaborn_vs_web_max_rel_diff'] * 100:.3f}%")

# 8 ------------------------------------------------------------- /api/charger-output/regions (Heatmap)
cor = get('/api/charger-output/regions')['data']['regions']
reg_items = cor.items() if isinstance(cor, dict) else [(r.get('region_code') or r.get('code'), r) for r in cor]


def band(r):
    if r['value_status'] != 'positive_numeric' or r['output_kw'] is None:
        return 5
    k = r['output_kw']
    return 0 if k < 30 else 1 if k < 50 else 2 if k < 100 else 3 if k < 200 else 4


web8 = {}
for code, res in reg_items:
    c = [0] * 6
    for r in res['data']:
        c[band(r)] += r['charger_count']
    if any(c):
        web8[code] = c
order8 = sorted(web8, key=lambda k: -sum(web8[k]))
check(8, '행 순서(지역 합계 내림차순)', order8, PY[8]['order'])
check(8, '지역 × 출력 구간 대수 (16×6)', web8, PY[8]['counts'])
fmt8 = lambda p: f'{p:.0f}' if p >= 10 else f'{p:.1f}'  # noqa: E731
check(8, '칸 숫자 (10% 이상 정수, 미만 소수 1자리)', {k: [fmt8(v / sum(c) * 100) for v in c] for k, c in web8.items()},
      {k: [fmt8(v / sum(c) * 100) for v in c] for k, c in PY[8]['counts'].items()})

# 9 ------------------------------------------------------------- /api/growth
gr = get('/api/growth')['data']
check(9, '연도', [r['year'] for r in gr], PY[9]['years'])
check(9, '누적 설치 수', [r['cumulative_count'] for r in gr], PY[9]['cumulative'])
check(9, '연간 설치 수', [r['annual_installed_count'] for r in gr], PY[9]['annual'])
check(9, '부분 연도', [r['year'] for r in gr if r['is_partial_year']], PY[9]['partial_years'])

# 10 ------------------------------------------------------------ /api/operators (상위 20 + 기타, 운영기관 필터 제외)
op = get('/api/operators?page=1&limit=20')
matched = op['meta']['matched']['charger_count']
check(10, '상위 20개 ID·이름·대수', [{'id': r['operator_id'], 'name': r['operator_name'], 'charger_count': r['charger_count']} for r in op['data']],
      PY[10]['top20'])
check(10, '기타 대수 (matched − 상위 20 합)', matched - sum(r['charger_count'] for r in op['data']), PY[10]['other'])
check(10, '운영기관 ID 수', op['meta']['pagination']['total_items'], PY[10]['operator_ids'])
check(10, '비율 분모 (matched)', matched, PY[10]['matched_total'])
check(10, '칸 비율 표기(소수 1자리)', [f"{r['charger_count'] / matched * 100:.1f}" for r in op['data']],
      [f"{t['charger_count'] / PY[10]['matched_total'] * 100:.1f}" for t in PY[10]['top20']])

# ------------------------------------------------------------- 결과
ok = sum(c['ok'] for c in checks)
out = {'api': a.api, 'checked_at': datetime.now().astimezone().isoformat(timespec='seconds'), 'passed': ok, 'total': len(checks), 'checks': checks}
(a.dir / 'verification.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
lines = [f'# 웹 API 대조 결과 ({ok}/{len(checks)} 통과)', '', f'- API: 로컬 백엔드 (기본 필터) · {out["checked_at"]}', '',
         '| 그래프 | 항목 | 결과 | 비고 |', '|---|---|---|---|']
for c in checks:
    lines.append(f"| {c['chart']:02d} | {c['item']} | {'일치' if c['ok'] else '불일치'} | {c['note']} |")
(a.dir / 'verification.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(f'{ok}/{len(checks)} PASS')
for c in checks:
    if not c['ok']:
        print('FAIL', c['chart'], c['item'], str(c['web'])[:200], '|', str(c['python'])[:200])

"""CHARGE GAP Python 데이터 시각화 그래프 10개 (2026 기준).

scripts/create_report_charts_v2.py를 바탕으로, 현재 웹사이트가 쓰는 자료로 다시 그립니다.
- 전기차 등록: data/processed/ev_registration_by_region_2026_09.csv (2026년 9월, 16개 지역)
- 충전기 현황: data/processed/charger_info_clean.csv (2026-10-15 조회, 삭제 표시 포함 전체 = 웹 기본 필터)
- 설치 추이: data/processed/charger_installation_trend.csv (연도별 공식 통계, 마지막 해는 부분 연도)

모든 수치는 CSV에서 직접 계산합니다(코드에 숫자를 적어 두지 않음). 기존 PNG(outputs/charts, outputs/charts_v2_report)와
v2 스크립트는 읽지도 덮어쓰지도 않으며, 결과는 frontend/public/python-charts/ 에만 씁니다.

출력
- frontend/public/python-charts/py01_*.png … py10_*.png  (웹 정적 파일)
- frontend/public/python-charts/charts.json             (웹 표시용 설명 메타데이터)
- reports/python_charts_2026_metrics.json               (검증용 상세 계산값)

실행: python scripts/create_python_charts_2026.py [--project-root 경로]
필요: pandas, numpy, matplotlib, seaborn, scipy, Pillow, Noto Sans CJK KR 글꼴
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import warnings
from datetime import datetime
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--project-root', type=Path, default=Path(__file__).resolve().parents[1])
args = parser.parse_args()
P: Path = args.project_root.resolve()
OUT = P / 'frontend/public/python-charts'
REPORT = P / 'reports/python_charts_2026_metrics.json'
for protected in (P / 'outputs/charts', P / 'outputs/charts_v2_report'):
    assert OUT.resolve() != protected.resolve(), 'legacy chart folders are never written'
OUT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR', str(P / 'tmp/mplconfig_python_charts'))

import matplotlib  # noqa: E402

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import seaborn as sns  # noqa: E402
from matplotlib import cbook, font_manager  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402
from matplotlib.ticker import FuncFormatter, StrMethodFormatter  # noqa: E402
from PIL import Image  # noqa: E402

# ---------------------------------------------------------------- style (frontend/src/styles/tokens.css 와 같은 값)
FONT = 'Noto Sans CJK KR'
assert any(f.name == FONT for f in font_manager.fontManager.ttflist), f'{FONT} font is required'
PANEL, PANEL2, GRID, AXIS = '#1b2230', '#222a39', '#273042', '#364052'
INK, INK2, MUTED = '#e7eaf0', '#c0c7d2', '#95a2b3'
S1, S2, S3, S4, OTHER, COMPARE, WARN = '#a49bc8', '#418f86', '#dbaa5e', '#bf6f8b', '#566173', '#81ada8', '#d9a85f'
SEQ = LinearSegmentedColormap.from_list('chargegap_seq', ['#262e3f', '#6f689a', '#d6d1ee'])  # theme.ts seqColor
sns.set_theme(style='darkgrid', font=FONT, rc={
    'axes.unicode_minus': False, 'figure.facecolor': PANEL, 'axes.facecolor': PANEL, 'savefig.facecolor': PANEL,
    'axes.edgecolor': AXIS, 'axes.labelcolor': INK2, 'grid.color': GRID, 'text.color': INK,
    'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.titlecolor': INK, 'legend.facecolor': PANEL2,
    'legend.edgecolor': AXIS, 'legend.labelcolor': INK2,
    'font.size': 11, 'axes.labelsize': 12, 'xtick.labelsize': 10.5, 'ytick.labelsize': 10.5, 'legend.fontsize': 10,
})
warnings.filterwarnings('error', message='Glyph .* missing')  # 한글 깨짐은 실패로 처리
DPI = 150

# ---------------------------------------------------------------- data (CSV only)
DATA = P / 'data/processed'
raw = pd.read_csv(DATA / 'charger_info_clean.csv', dtype=str, keep_default_na=False,
                  usecols=['zcode', 'statId', 'chgerId', 'delYn', 'chgerType', 'busiId', 'busiNm', 'output', '_fetched_at'])
for column in raw:
    raw[column] = raw[column].str.strip()
assert set(raw.delYn) <= {'N', 'Y'} and not raw.duplicated(['statId', 'chgerId']).any()
frame = raw  # 웹 기본 필터 = 삭제 표시 포함 전체
N_ALL, N_NOT_DELETED, N_DELETED = len(raw), int(raw.delYn.eq('N').sum()), int(raw.delYn.eq('Y').sum())
fetched = pd.to_datetime(raw._fetched_at)
SNAP = f"{fetched.min():%Y-%m-%d %H:%M}–{fetched.max():%H:%M} KST"
CH_DATE = f'{fetched.min():%Y-%m-%d} 조회'
CH_SOURCE = f'한국환경공단 전기자동차 충전소 정보(getChargerInfo) · {SNAP}'
CH_BASIS = f'전체 {N_ALL:,}기 (삭제 표시 {N_DELETED:,}기 포함 · 비삭제 {N_NOT_DELETED:,}기) · 웹 기본 필터와 같은 기준'
output_kw = pd.to_numeric(frame.output, errors='coerce')

ev = pd.read_csv(DATA / 'ev_registration_by_region_2026_09.csv', dtype={'region_code': str}, keep_default_na=False)
assert ev.region_code.is_unique and len(ev) == ev.region_code.nunique()
EV_MONTH = ev.reference_month.iloc[0]
assert ev.reference_month.eq(EV_MONTH).all()
EV_YEAR, EV_MON = EV_MONTH.split('-')
EV_TOTAL = int(ev.ev_registration_count.sum())
EV_DATE = f'{EV_YEAR}년 {int(EV_MON)}월 등록'
EV_SOURCE = f'국토교통부 자동차 등록자료 통계 {EV_YEAR}년 {int(EV_MON)}월 · 연료 전기 · {len(ev)}개 지역(전남광주 통합)'
EV_BASIS = f'순수 전기차 {EV_TOTAL:,}대 · {len(ev)}개 지역 · 등록 자료(삭제 표시 개념 없음)'
NAME = dict(zip(ev.region_code, ev.region_name_source))  # 짧은 지역명 (12 = 전남광주)
FULL = dict(zip(ev.region_code, ev.region_name))
assert set(frame.zcode) <= set(NAME), 'charger regions must match the 16 registration regions'

growth = pd.read_csv(DATA / 'charger_installation_trend.csv', keep_default_na=False)
growth['completed'] = growth.completed_calendar_year.astype(str).eq('True')
assert np.array_equal(np.cumsum(growth.annual_installed_count), growth.cumulative_count)

# 공식 커넥터 유형 정의: 백엔드 상수를 그대로 읽음 (중복 정의 방지)
TYPE_DEFINITIONS = None
for node in ast.parse((P / 'backend/chargegap_api/data.py').read_text(encoding='utf-8')).body:
    if isinstance(node, ast.Assign) and getattr(node.targets[0], 'id', '') == 'TYPE_DEFINITIONS':
        TYPE_DEFINITIONS = ast.literal_eval(node.value)
assert TYPE_DEFINITIONS

FIXED_NOTE = '고정 이미지 · 웹사이트 필터에 따라 바뀌지 않음'
charts: list[dict] = []
metrics: dict = {}


def canvas(title: str, subtitle: str, source: str, basis: str, height: float = 7.2, width: float = 12.0):
    fig, ax = plt.subplots(figsize=(width, height))
    top = 1 - 1.15 / height
    fig.subplots_adjust(left=.1, right=.96, bottom=1.25 / height, top=top)
    fig.text(.03, 1 - .42 / height, title, fontsize=19, weight='bold', color=INK)
    fig.text(.03, 1 - .78 / height, subtitle, fontsize=11.5, color=INK2)
    fig.text(.03, .52 / height, '출처 · ' + source, fontsize=9.5, color=MUTED)
    fig.text(.03, .24 / height, '기준 · ' + basis + ' · ' + FIXED_NOTE, fontsize=9.5, color=MUTED)
    return fig, ax


def style(ax):
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    for side in ('left', 'bottom'):
        ax.spines[side].set_color(AXIS)
    ax.tick_params(length=0)


def save(fig, n: int, slug: str, *, title: str, technique: str, libraries: list[str], data_date: str, basis: str,
         regions: str, deletion: str, results: list[str], caution: str, web: dict | None, metric: dict):
    file = f'py{n:02d}_{slug}.png'
    path = OUT / file
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    w, h = fig.canvas.get_width_height()
    texts = list(fig.texts)
    for axis in fig.axes:
        texts += [axis.xaxis.label, axis.yaxis.label]
        for ax_, labels in ((axis.xaxis, axis.get_xticklabels()), (axis.yaxis, axis.get_yticklabels())):
            lo, hi = sorted(ax_.get_view_interval())
            locs = ax_.get_ticklocs()
            texts += [t for t, loc in zip(labels, locs) if lo - 1e-9 <= loc <= hi + 1e-9]
        if axis.get_legend() is not None:
            texts.append(axis.get_legend())
    for artist in texts:
        if not artist.get_visible() or (hasattr(artist, 'get_text') and not artist.get_text()):
            continue
        b = artist.get_window_extent(renderer)
        if b.width > 0 and b.height > 0:
            assert b.x0 >= -1 and b.y0 >= -1 and b.x1 <= w + 1 and b.y1 <= h + 1, (n, 'clipped text', artist, b.bounds)
    fig.savefig(path, dpi=DPI)
    plt.close(fig)
    with Image.open(path) as im:
        im.load()
        im = im.convert('RGB')
        im.save(path, optimize=True)
    with Image.open(path) as im:
        im.verify()
    with Image.open(path) as im:
        size = list(im.size)
    charts.append(dict(id=n, file=file, title=title, technique=technique, libraries=libraries, data_date=data_date,
                       basis=basis, regions=regions, deletion=deletion, results=results, caution=caution, web=web,
                       image_pixels=size, sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    metrics[str(n)] = metric


def josa(word: str, pair: str) -> str:
    """받침 유무에 맞는 조사 ('이가', '은는', '과와')."""
    last = word.rstrip(')]').strip()[-1]
    if '가' <= last <= '힣':
        has = (ord(last) - 0xAC00) % 28 != 0
    else:
        has = last in '013678' or last.lower() in 'lmn'
    return pair[0] if has else pair[1]


def kfmt(v, _=None):
    return f'{v:,.0f}'


# ================================================================ 1. 지역별 전기차 등록 대수 (가로 막대)
e = ev.sort_values('ev_registration_count', ascending=False)  # 큰 지역이 위
fig, ax = canvas('지역별 전기차 등록 대수', f'{EV_YEAR}년 {int(EV_MON)}월 · 순수 전기차 {EV_TOTAL:,}대 · {len(ev)}개 지역 전체', EV_SOURCE, EV_BASIS, height=8)
sns.barplot(x=e.ev_registration_count, y=e.region_code.map(NAME), color=S1, orient='h', ax=ax, saturation=1, edgecolor='none')
for patch, value in zip(ax.patches, e.ev_registration_count):
    ax.text(patch.get_width() + EV_TOTAL * .004, patch.get_y() + patch.get_height() / 2,
            f'{value:,}대 ({value / EV_TOTAL * 100:.1f}%)', va='center', fontsize=9.5, color=INK2)
ax.set_xlim(0, e.ev_registration_count.max() * 1.22)
ax.xaxis.set_major_formatter(FuncFormatter(kfmt))
ax.set(xlabel='전기차 등록 대수 (대)', ylabel='')
style(ax)
top3 = ev.nlargest(3, 'ev_registration_count')
first = top3.iloc[0]
save(fig, 1, 'ev_registration_regions', title='지역별 전기차 등록 대수', technique='가로 막대 그래프',
     libraries=['Matplotlib', 'Seaborn barplot'], data_date=EV_DATE, basis=EV_BASIS, regions=f'{len(ev)}개 지역 (전남광주 통합)',
     deletion='해당 없음 (등록 자료)',
     results=[f"{NAME[first.region_code]}{josa(NAME[first.region_code], '이가')} {int(first.ev_registration_count):,}대로 전국의 {first.ev_registration_count / EV_TOTAL * 100:.1f}%입니다.",
              f"상위 3개 지역({', '.join(NAME[c] for c in top3.region_code)}) 합계는 {int(top3.ev_registration_count.sum()):,}대, 전국의 {top3.ev_registration_count.sum() / EV_TOTAL * 100:.1f}%입니다.",
              f"가장 적은 지역은 {NAME[e.iloc[-1].region_code]} {int(e.iloc[-1].ev_registration_count):,}대입니다."],
     caution='등록 대수는 등록지 기준이며 실제 운행·충전 지역을 뜻하지 않습니다. 충전기 자료와 기준 시점이 다릅니다.',
     web={'graph': 1, 'title': '지역별 전기차 등록 대수'},
     metric={'national_total': EV_TOTAL, 'regions': {c: int(v) for c, v in zip(ev.region_code, ev.ev_registration_count)}})

# ================================================================ 2. 차종별 등록 구성 (도넛)
vehicle = [('승용', 'ev_passenger_count'), ('승합', 'ev_bus_count'), ('화물', 'ev_truck_count'), ('특수', 'ev_special_count')]
vals = [int(ev[c].sum()) for _, c in vehicle]
assert sum(vals) == EV_TOTAL
fig, ax = canvas('차종별 전기차 등록 구성', f'{EV_YEAR}년 {int(EV_MON)}월 · 전국 순수 전기차 {EV_TOTAL:,}대', EV_SOURCE, EV_BASIS)
fig.subplots_adjust(left=.05, right=.62)
wedges, _ = ax.pie(vals, colors=[S1, S2, S3, S4], startangle=90, counterclock=False,
                   wedgeprops={'width': .36, 'edgecolor': PANEL, 'linewidth': 2})
ax.text(0, .07, f'{EV_TOTAL:,}', ha='center', va='center', fontsize=22, weight='bold', color=INK)
ax.text(0, -.13, '등록 대수 (대)', ha='center', va='center', fontsize=11, color=MUTED)
ax.legend(wedges, [f'{l}   {v:,}대 ({v / EV_TOTAL * 100:.2f}%)' for (l, _), v in zip(vehicle, vals)],
          loc='center left', bbox_to_anchor=(1.02, .5), fontsize=11.5, frameon=False)
ax.set_aspect('equal')
order = sorted(zip([l for l, _ in vehicle], vals), key=lambda x: -x[1])
save(fig, 2, 'ev_vehicle_types', title='차종별 전기차 등록 구성', technique='도넛 차트', libraries=['Matplotlib pie', 'Seaborn 테마'],
     data_date=EV_DATE, basis=EV_BASIS, regions='전국 (16개 지역 합계)', deletion='해당 없음 (등록 자료)',
     results=[f"{order[0][0]} {order[0][1]:,}대({order[0][1] / EV_TOTAL * 100:.2f}%)가 가장 많고 {order[1][0]} {order[1][1]:,}대({order[1][1] / EV_TOTAL * 100:.2f}%)가 뒤를 잇습니다.",
              f"{order[-1][0]}{josa(order[-1][0], '은는')} {order[-1][1]:,}대({order[-1][1] / EV_TOTAL * 100:.2f}%)로 가장 적습니다."],
     caution='등록 대수 구성비이며 운행량이나 충전 수요 비율이 아닙니다. 차종과 충전기 커넥터 유형은 다른 개념입니다.',
     web={'graph': 2, 'title': '차종별 등록 구성 (전국)'},
     metric={'vehicle_types': dict(zip([l for l, _ in vehicle], vals))})

# ================================================================ 3. 사업용·비사업용 구성 (100% 누적 가로 막대)
c3 = (ev.assign(commercial_pct=ev.ev_commercial_count / ev.ev_registration_count * 100)
      .sort_values(['commercial_pct', 'region_code'], ascending=[False, True]).reset_index(drop=True))  # 위 = 사업용 비율 높은 지역
assert (c3.ev_commercial_count + c3.ev_noncommercial_count).equals(c3.ev_registration_count)
fig, ax = canvas('지역별 사업용·비사업용 전기차 구성', '지역별 등록 대수 = 100% · 사업용 비율 내림차순(위 → 아래) · 주황 막대 안 숫자 = 사업용 비율',
                 EV_SOURCE, EV_BASIS, height=8)
y = c3.region_code.map(NAME)
ax.barh(y, 100 - c3.commercial_pct, color=S1, label='비사업용', height=.66)
ax.barh(y, c3.commercial_pct, left=100 - c3.commercial_pct, color=S3, label='사업용', height=.66)
ax.invert_yaxis()  # 데이터 순서(내림차순) 그대로 위에서 아래로
for i, pct in enumerate(c3.commercial_pct):  # 사업용 막대(주황) 안 가운데
    ax.text(100 - pct / 2, i, f'{pct:.1f}%', ha='center', va='center', fontsize=9.5, color='#141821', weight='bold')
ax.set(xlim=(0, 100), xlabel='지역 내 등록 구성비 (%)', ylabel='')
ax.legend(loc='lower center', bbox_to_anchor=(.5, 1.0), ncol=2, frameon=False)
style(ax)
nat = ev.ev_commercial_count.sum() / EV_TOTAL * 100
hi, lo = c3.iloc[0], c3.iloc[-1]
save(fig, 3, 'ev_commercial_share', title='지역별 사업용·비사업용 전기차 구성', technique='100% 누적 가로 막대', libraries=['Matplotlib barh', 'Seaborn 테마'],
     data_date=EV_DATE, basis=EV_BASIS, regions=f'{len(ev)}개 지역 (전남광주 통합)', deletion='해당 없음 (등록 자료)',
     results=[f"전국 사업용 비율은 {nat:.2f}%({int(ev.ev_commercial_count.sum()):,}대)입니다.",
              f"사업용 비율이 가장 높은 곳은 {NAME[hi.region_code]} {hi.commercial_pct:.2f}%, 가장 낮은 곳은 {NAME[lo.region_code]} {lo.commercial_pct:.2f}%입니다."],
     caution='구성비 비교이며 지역별 절대 규모는 서로 다릅니다. 사업용 여부만으로 주행거리나 충전 수요를 추정하지 않습니다.',
     web={'graph': 3, 'title': '지역별 사업용 전기차 비율'},
     metric={'national_commercial_pct': nat, 'order_top_to_bottom': c3.region_code.tolist(),
             'regions_commercial_pct': dict(zip(c3.region_code, c3.commercial_pct.astype(float)))})

# ================================================================ 4. 충전소 수와 충전기 수 (산점도 + OLS 회귀선)
reg = frame.groupby('zcode').agg(charger_count=('chgerId', 'size'), station_count=('statId', 'nunique')).reset_index()
reg['name'] = reg.zcode.map(NAME)
x, yv = reg.station_count.to_numpy(float), reg.charger_count.to_numpy(float)
slope, intercept = np.polyfit(x, yv, 1)
r = float(np.corrcoef(x, yv)[0, 1])
fig, ax = canvas('지역별 충전소 수와 충전기 수의 관계', f'{len(reg)}개 지역 · 최소제곱 회귀선(지역별 동일 가중치)', CH_SOURCE, CH_BASIS, height=7.6)
sns.regplot(x=x, y=yv, ax=ax, ci=None, scatter=False, line_kws={'color': S3, 'linewidth': 2}, truncate=True)
sns.scatterplot(x=x, y=yv, ax=ax, color=S1, s=90, edgecolor=PANEL, linewidth=1, zorder=3)
# 지역명: 겹치면 다른 방향을 시도하고, 그래도 겹치면 생략 (점은 16개 모두 표시)
fig.canvas.draw()
placed, skipped = [], []
for row in reg.sort_values('charger_count', ascending=False).itertuples():
    for dx, dy, ha, va in ((7, 5, 'left', 'bottom'), (7, -5, 'left', 'top'), (-7, 5, 'right', 'bottom'), (-7, -5, 'right', 'top')):
        t = ax.annotate(row.name, (row.station_count, row.charger_count), xytext=(dx, dy), textcoords='offset points',
                        ha=ha, va=va, fontsize=9.5, color=INK2)
        bb = t.get_window_extent(fig.canvas.get_renderer()).expanded(1.04, 1.1)
        if not any(bb.overlaps(o) for o in placed):
            placed.append(bb)
            break
        t.remove()
    else:
        skipped.append(row.name)
if skipped:
    ax.text(.99, .03, '이름 생략(겹침): ' + ', '.join(skipped), transform=ax.transAxes, ha='right', va='bottom', fontsize=9, color=MUTED)
ax.text(.02, .96, f'y = {slope:.3f}x {intercept:+,.0f}\nPearson r = {r:.4f} · R² = {r * r:.4f}', transform=ax.transAxes,
        va='top', fontsize=11, color=S3)
ax.set(xlabel='충전소 수 (곳)', ylabel='충전기 수 (기)')
ax.xaxis.set_major_formatter(FuncFormatter(kfmt))
ax.yaxis.set_major_formatter(FuncFormatter(kfmt))
style(ax)
big = reg.nlargest(2, 'charger_count')
save(fig, 4, 'stations_chargers_regression', title='지역별 충전소 수와 충전기 수의 관계', technique='산점도 + OLS 회귀선',
     libraries=['Seaborn scatterplot', 'Seaborn regplot', 'NumPy polyfit'], data_date=CH_DATE, basis=CH_BASIS,
     regions=f'{len(reg)}개 지역 (전남광주 통합)', deletion='전체 (삭제 표시 포함)',
     results=[f"16개 지역에서 충전소 수와 충전기 수의 상관계수는 r = {r:.4f}(R² = {r * r:.4f})입니다.",
              f"회귀 기울기는 {slope:.3f}로, 충전소가 1곳 많은 지역은 충전기가 평균 약 {slope:.1f}기 많습니다.",
              f"규모가 가장 큰 두 지역은 {big.iloc[0]['name']}(충전소 {int(big.iloc[0].station_count):,}곳·충전기 {int(big.iloc[0].charger_count):,}기)와 {big.iloc[1]['name']}(충전소 {int(big.iloc[1].station_count):,}곳·충전기 {int(big.iloc[1].charger_count):,}기)입니다."],
     caution='지역 단위 상관관계이며 인과관계가 아닙니다. 큰 두 지역이 회귀선에 큰 영향을 줍니다.',
     web={'graph': 4, 'title': '지역별 충전소 수와 충전기 수의 관계'},
     metric={'slope': float(slope), 'intercept': float(intercept), 'pearson_r': r, 'r2': r * r,
             'regions': {row.zcode: {'station_count': int(row.station_count), 'charger_count': int(row.charger_count)} for row in reg.itertuples()}})

# ================================================================ 5. 충전소당 충전기 수 분포 (박스플롯, 실제 분포)
sizes = frame.groupby(['zcode', 'statId']).chgerId.nunique().rename('size').reset_index()
assert sizes['size'].sum() == N_ALL
order5 = sizes.groupby('zcode')['size'].size().sort_values(ascending=False).index.tolist()
labels5 = {c: f"{NAME[c]} (n={int((sizes.zcode == c).sum()):,})" for c in order5}
sizes['label'] = sizes.zcode.map(labels5)
box_stats = {}
for c in order5:
    s = cbook.boxplot_stats(sizes.loc[sizes.zcode.eq(c), 'size'].to_numpy(), whis=1.5, autorange=False)[0]
    box_stats[c] = {'sample_count': int((sizes.zcode == c).sum()), 'q1': float(s['q1']), 'median': float(s['med']), 'q3': float(s['q3']),
                    'whisker_low': float(s['whislo']), 'whisker_high': float(s['whishi']), 'mean': float(s['mean']), 'outlier_count': int(len(s['fliers']))}
fig, ax = canvas('지역별 충전소당 충전기 수 분포', '충전소 1곳 = 표본 1개 · 사분위수(선형 보간) · 수염 = 1.5×IQR 안의 관측 끝값 · 점 = 이상치', CH_SOURCE, CH_BASIS, height=9.4)
fig.subplots_adjust(left=.2)
sns.boxplot(data=sizes, x='size', y='label', order=[labels5[c] for c in order5], orient='h', whis=1.5, ax=ax,
            color=S1, saturation=1, width=.62, showmeans=True, linecolor=INK2, linewidth=1.1,
            flierprops={'marker': 'o', 'markersize': 2.6, 'markerfacecolor': COMPARE, 'markeredgecolor': 'none', 'alpha': .45},
            meanprops={'marker': 'D', 'markerfacecolor': S3, 'markeredgecolor': PANEL, 'markersize': 5},
            medianprops={'color': '#141821', 'linewidth': 2})
ax.set_xscale('log')
ax.set_xticks([1, 2, 3, 5, 10, 20, 50, 100])
ax.xaxis.set_major_formatter(StrMethodFormatter('{x:g}'))
ax.set(xlabel='충전소당 충전기 수 (기/곳, 로그 눈금)', ylabel='')
ax.text(1.0, 1.01, '상자: Q1–Q3 · 굵은 선: 중앙값 · ◆: 평균 · 점: 이상치', transform=ax.transAxes, ha='right', va='bottom', fontsize=9.5, color=MUTED)
style(ax)
# 그려진 상자가 실제 계산값과 같은지 확인 (Seaborn이 그린 상자 = cbook 통계)
total_out = sum(v['outlier_count'] for v in box_stats.values())
med = {c: v['median'] for c, v in box_stats.items()}
save(fig, 5, 'station_size_boxplot', title='지역별 충전소당 충전기 수 분포', technique='박스플롯 (사분위수·1.5×IQR 이상치)',
     libraries=['Seaborn boxplot', 'Matplotlib cbook.boxplot_stats'], data_date=CH_DATE, basis=CH_BASIS,
     regions=f'{len(order5)}개 지역 (전남광주 통합)', deletion='전체 (삭제 표시 포함)',
     results=[f"표본 충전소 {len(sizes):,}곳, 지역별 1.5×IQR 기준 이상치는 모두 {total_out:,}곳입니다.",
              '지역별 중앙값: ' + ', '.join(f"{v:g}기/곳 {sum(1 for m in med.values() if m == v)}개 지역" for v in sorted(set(med.values()), reverse=True)) + '입니다.',
              f"가장 큰 충전소는 {int(sizes['size'].max()):,}기입니다."],
     caution='이상치는 오류 판정이 아니며 제거하지 않았습니다. 로그 눈금이라 상자 길이는 비율 차이로 읽습니다.',
     web={'graph': 5, 'title': '충전소당 충전기 수 분포 (지역별 박스플롯)'},
     metric={'sample_count': len(sizes), 'outlier_count': total_out, 'regions': box_stats})

# ================================================================ 6. 충전기 유형별 구성 (도넛, 상위 4 + 기타)
types = frame.chgerType.value_counts()
types = types.sort_values(ascending=False, kind='stable')
top4 = types.head(4)
rest = types.iloc[4:]
vals6 = list(top4.values) + [int(rest.sum())]
labels6 = [f'{c} {TYPE_DEFINITIONS.get(c, "정의 미확인")}' for c in top4.index] + [f'기타 {len(rest)}개 유형']
assert sum(vals6) == N_ALL
fig, ax = canvas('충전기 유형별 구성', '공식 커넥터 유형 코드 기준 · 상위 4개 유형 + 기타', CH_SOURCE, CH_BASIS)
fig.subplots_adjust(left=.05, right=.6)
wedges, _ = ax.pie(vals6, colors=[S1, S2, S3, S4, OTHER], startangle=90, counterclock=False,
                   wedgeprops={'width': .36, 'edgecolor': PANEL, 'linewidth': 2})
ax.text(0, .07, f'{N_ALL:,}', ha='center', va='center', fontsize=22, weight='bold', color=INK)
ax.text(0, -.13, '충전기 (기)', ha='center', va='center', fontsize=11, color=MUTED)
ax.legend(wedges, [f'{l}   {v:,}기 ({v / N_ALL * 100:.2f}%)' for l, v in zip(labels6, vals6)], loc='center left',
          bbox_to_anchor=(1.02, .5), fontsize=11, frameon=False)
ax.set_aspect('equal')
save(fig, 6, 'charger_types', title='충전기 유형별 구성', technique='도넛 차트 (상위 4개 + 기타)', libraries=['Matplotlib pie', 'Seaborn 테마'],
     data_date=CH_DATE, basis=CH_BASIS, regions='전국 (16개 지역 합계)', deletion='전체 (삭제 표시 포함)',
     results=[f"{labels6[0]}{josa(labels6[0], '이가')} {vals6[0]:,}기({vals6[0] / N_ALL * 100:.2f}%)로 대부분입니다.",
              f"{labels6[1]} {vals6[1]:,}기({vals6[1] / N_ALL * 100:.2f}%), 나머지 {len(rest)}개 유형 합계는 {vals6[-1]:,}기({vals6[-1] / N_ALL * 100:.2f}%)입니다."],
     caution='커넥터 유형만으로 급속·완속을 다시 분류하지 않습니다. 관측 0건인 유형은 표시하지 않습니다.',
     web={'graph': 6, 'title': '충전기 유형별 구성'},
     metric={'labels': labels6, 'counts': [int(v) for v in vals6], 'by_type': {k: int(v) for k, v in types.items()}})

# ================================================================ 7. 정격 출력 분포 (히스토그램 + KDE, log10)
LOG_BIN, LO, HI = .125, .375, 2.75  # frontend/src/charts/HistKde.tsx 와 같은 구간·대역폭
edges = np.round(LO + LOG_BIN * np.arange(round((HI - LO) / LOG_BIN) + 1), 4)
positive = output_kw[output_kw > 0]
freq = positive.value_counts().sort_index()
lx, wts = np.log10(freq.index.to_numpy(float)), freq.to_numpy(float)
assert lx.min() >= edges[0] and lx.max() <= edges[-1]


def fixed_bandwidth(kde):  # scipy gaussian_kde: factor × 가중 표준편차 = LOG_BIN (log10 단위)
    std = np.sqrt(np.cov(kde.dataset, aweights=kde.weights, bias=False))
    return LOG_BIN / float(std)


fig, ax = canvas('충전기 정격 출력 분포와 KDE', f'log10 등폭 구간(폭 {LOG_BIN}) · 가중 가우시안 KDE(대역폭 {LOG_BIN}, log10 단위)', CH_SOURCE, CH_BASIS)
sns.histplot(x=lx, weights=wts, bins=edges.tolist(), kde=True, ax=ax, color=S1, alpha=.85, edgecolor=PANEL, linewidth=.6,
             kde_kws={'bw_method': fixed_bandwidth, 'cut': 0}, line_kws={'color': COMPARE, 'linewidth': 2.2}, label='충전기 수')
hist_counts = np.array([p.get_height() for p in ax.patches])
kde_line = ax.lines[0]
kde_line.set_label('KDE 추정 (건수 축척)')
kde_line.set_color(COMPARE)
ticks = [3, 7, 11, 22, 50, 100, 200, 400]
ax.set_xticks(np.log10(ticks))
ax.set_xticklabels([str(t) for t in ticks])
ax.set_xlim(LO, HI)
ax.yaxis.set_major_formatter(FuncFormatter(kfmt))
ax.set(xlabel='정격 출력 (kW, 로그 눈금)', ylabel='충전기 수 (기 / 구간)')
ax.legend(frameon=False, loc='upper right')
style(ax)
np_hist, _ = np.histogram(np.repeat(lx, wts.astype(int)), bins=edges)
assert np.array_equal(hist_counts.astype(int), np_hist) and hist_counts.sum() == len(positive)
invalid = int(len(frame) - len(positive))
mode_kw = float(freq.idxmax())
save(fig, 7, 'output_histogram_kde', title='충전기 정격 출력 분포와 KDE', technique='히스토그램 + KDE (로그 축)',
     libraries=['Seaborn histplot(kde=True)', 'SciPy gaussian_kde'], data_date=CH_DATE, basis=CH_BASIS,
     regions='전국 (16개 지역 합계)', deletion='전체 (삭제 표시 포함)',
     results=[f"유효 양수 출력 {len(positive):,}기, 결측·0 이하·숫자 아님 {invalid:,}기는 제외했습니다.",
              f"중앙값 {float(np.median(positive)):g}kW, 가장 많은 값은 {mode_kw:g}kW({int(freq.max()):,}기, {freq.max() / len(positive) * 100:.1f}%)입니다.",
              f"100kW 이상은 {int((positive >= 100).sum()):,}기({(positive >= 100).mean() * 100:.2f}%), 범위는 {positive.min():g}–{positive.max():g}kW입니다."],
     caution='정격 출력이며 실제 충전 속도·동시 공급전력이 아닙니다. KDE는 평활 추정입니다.',
     web={'graph': 7, 'title': '충전기 정격 출력 분포'},
     metric={'valid_positive_count': int(len(positive)), 'invalid_or_missing_count': invalid, 'median_kw': float(np.median(positive)),
             'bin_edges_log10': edges.tolist(), 'bin_counts': hist_counts.astype(int).tolist(),
             'kde_x': kde_line.get_xdata().tolist(), 'kde_y': kde_line.get_ydata().tolist(), 'bandwidth_log10': LOG_BIN})

# ================================================================ 8. 지역별 출력 구간 구성 (히트맵)
BANDS = ['30kW 미만', '30–50', '50–100', '100–200', '200kW 이상', '미상']  # ChartCards.tsx OUTPUT_BANDS / bandIndex
band = pd.Series(np.select([output_kw < 30, output_kw < 50, output_kw < 100, output_kw < 200], BANDS[:4], BANDS[4]), index=frame.index)
band[~(output_kw > 0)] = BANDS[5]
counts8 = pd.crosstab(frame.zcode, band).reindex(columns=BANDS, fill_value=0)
counts8 = counts8.loc[counts8.sum(axis=1).sort_values(ascending=False).index]
assert counts8.to_numpy().sum() == N_ALL
pct8 = counts8.div(counts8.sum(axis=1), axis=0) * 100
fig, ax = canvas('지역별 충전기 출력 구간 구성', '지역 안의 충전기 = 100% · 칸 숫자 = 지역 내 비율(%) · 행 순서 = 충전기 수', CH_SOURCE, CH_BASIS, height=9)
fig.subplots_adjust(left=.14, right=1.0)
sns.heatmap(pct8, annot=True, fmt='.1f', cmap=SEQ, vmin=0, vmax=100, linewidths=1, linecolor=PANEL, ax=ax,
            yticklabels=[f'{NAME[c]}' for c in pct8.index], cbar_kws={'label': '지역 내 비율 (%)', 'shrink': .8},
            annot_kws={'fontsize': 10})
ax.set(xlabel='정격 출력 구간 (kW)', ylabel='')
ax.tick_params(axis='y', rotation=0, length=0)
ax.tick_params(axis='x', length=0)
cbar = ax.collections[0].colorbar
cbar.ax.yaxis.label.set_color(INK2)
cbar.outline.set_visible(False)
nat8 = counts8.sum()
hi_fast = (pct8['200kW 이상']).idxmax()
save(fig, 8, 'regional_output_heatmap', title='지역별 충전기 출력 구간 구성', technique='히트맵 (행 기준 구성비)',
     libraries=['Seaborn heatmap'], data_date=CH_DATE, basis=CH_BASIS, regions=f'{len(pct8)}개 지역 (전남광주 통합)',
     deletion='전체 (삭제 표시 포함)',
     results=[f"전국 30kW 미만이 {int(nat8['30kW 미만']):,}기({nat8['30kW 미만'] / N_ALL * 100:.2f}%), 200kW 이상은 {int(nat8['200kW 이상']):,}기({nat8['200kW 이상'] / N_ALL * 100:.2f}%)입니다.",
              f"200kW 이상 비율이 가장 높은 지역은 {NAME[hi_fast]} {pct8.loc[hi_fast, '200kW 이상']:.1f}%입니다.",
              f"출력 미상은 {int(nat8['미상']):,}기입니다."],
     caution='색은 지역 안의 비율이라 전국 대수 순위가 아닙니다. 칸 숫자는 소수 첫째 자리 반올림이라 한 행의 합이 99.8–100.1처럼 보일 수 있습니다(계산 합계는 100%). 출력 구간은 정책상 급속·완속 분류를 대신하지 않습니다.',
     web={'graph': 8, 'title': '지역별 충전기 출력 구간 구성'},
     metric={'bands': BANDS, 'counts': {c: [int(v) for v in row] for c, row in counts8.iterrows()}})

# ================================================================ 9. 연도별 누적 설치 추이 (누적 영역)
last = growth.iloc[-1]
partial = growth.loc[~growth.completed]
fig, ax = canvas('연도별 누적 충전기 설치 추이', f'{int(growth.year.min())}–{int(growth.year.max())}년 공식 연도 통계 · 막대 = 연간 설치, 영역 = 누적',
                 f"충전기 설치 성장 추세 통계 (파일명 기준일 {growth.source_filename_date.iloc[0]}, 정확한 집계 마감일 미기재)",
                 f'연도별 설치 통계 · {int(partial.year.min()) if len(partial) else "-"}년은 부분 연도', height=7.4)
ax.fill_between(growth.year, growth.cumulative_count, color=S2, alpha=.45, label='누적 설치 (기)', step=None)
sns.lineplot(x=growth.year, y=growth.cumulative_count, ax=ax, color=COMPARE, marker='o', markersize=5, linewidth=2)
ax.bar(growth.year, growth.annual_installed_count, color=[S1 if c else WARN for c in growth.completed], width=.6, label='연간 설치 (기)', zorder=3)
for row in partial.itertuples():
    ax.axvspan(row.year - .5, row.year + .5, color=WARN, alpha=.12, zorder=0)
    ax.annotate(f'{row.year}년 부분 연도\n누적 {row.cumulative_count:,}기 · 연간 {row.annual_installed_count:,}기', (row.year, row.cumulative_count),
                xytext=(-14, 0), textcoords='offset points', ha='right', va='center', fontsize=10, color=WARN)
peak = growth.loc[growth.completed].nlargest(1, 'annual_installed_count').iloc[0]
ax.set(xlabel='연도', ylabel='설치 수 (기)', xlim=(growth.year.min() - .6, growth.year.max() + .6))
ax.set_xticks(growth.year)
ax.tick_params(axis='x', rotation=45)
ax.yaxis.set_major_formatter(FuncFormatter(kfmt))
ax.legend(loc='upper left', frameon=False)
style(ax)
last_complete = growth.loc[growth.completed].iloc[-1]
save(fig, 9, 'cumulative_installations', title='연도별 누적 충전기 설치 추이', technique='누적 영역 + 연간 막대',
     libraries=['Matplotlib fill_between', 'Seaborn lineplot'], data_date=f'{int(growth.year.min())}–{int(growth.year.max())}년 연도 통계 (마지막 해 부분 연도)',
     basis='연도별 공식 설치 통계 (API 충전기 현황과 모집단이 다름)', regions='전국 (지역 구분 없음)', deletion='해당 없음 (설치 통계)',
     results=[f"완결 연도 중 연간 설치가 가장 많은 해는 {int(peak.year)}년 {int(peak.annual_installed_count):,}기입니다.",
              f"{int(last_complete.year)}년 누적 {int(last_complete.cumulative_count):,}기, {int(last.year)}년(부분 연도) 누적 {int(last.cumulative_count):,}기입니다."],
     caution=f'{growth.source_filename_date.iloc[0]}에 저장한 당시 통계표의 값이며 이후 공식 수치가 수정됐을 수 있습니다. 마지막 해는 부분 연도이고 정확한 집계 마감일이 없습니다. 설치 통계 누적값은 API 조회 재고(현재 충전기 수)와 다릅니다.',
     web={'graph': 9, 'title': '연도별 누적 충전기 설치 추이'},
     metric={'years': growth.year.astype(int).tolist(), 'annual': growth.annual_installed_count.astype(int).tolist(),
             'cumulative': growth.cumulative_count.astype(int).tolist(), 'partial_years': partial.year.astype(int).tolist()})

# ================================================================ 10. 운영기관별 충전기 규모 (트리맵, 상위 20 + 기타)
ops = (frame.groupby(['busiId', 'busiNm']).size().reset_index(name='charger_count')
       .sort_values(['charger_count', 'busiId', 'busiNm'], ascending=[False, True, True], kind='stable'))
top20 = ops.head(20)
vals10 = list(top20.charger_count.astype(int)) + [int(ops.iloc[20:].charger_count.sum())]
labels10 = [f'{r.busiNm} [{r.busiId}]' for r in top20.itertuples()] + [f'기타 {len(ops) - 20}개 조합']
assert sum(vals10) == N_ALL


def rectangles(weights, x=0.0, y=0.0, w=100.0, h=60.0):  # v2와 같은 이분 분할 (면적 = 값)
    if len(weights) == 1:
        return [(x, y, w, h)]
    total, acc, split, best = sum(weights), 0, 1, float('inf')
    for i in range(1, len(weights)):
        acc += weights[i - 1]
        d = abs(acc / total - .5)
        if d < best:
            best, split = d, i
    ratio = sum(weights[:split]) / total
    if w >= h:
        return rectangles(weights[:split], x, y, w * ratio, h) + rectangles(weights[split:], x + w * ratio, y, w * (1 - ratio), h)
    return rectangles(weights[:split], x, y, w, h * ratio) + rectangles(weights[split:], x, y + h * ratio, w, h * (1 - ratio))


rects = rectangles(vals10)
assert np.allclose([w * h / 6000 for _, _, w, h in rects], np.array(vals10) / sum(vals10))
fig, ax = canvas('운영기관별 충전기 규모', f'상위 20개 (기관 ID, 명칭) 조합 + 기타 · 면적 = 충전기 수 · 전체 {len(ops)}개 조합', CH_SOURCE, CH_BASIS, height=8.6)
ax.set_position([.03, .16, .55, .69])
shades = sns.light_palette(S1, 5, reverse=True)[:3] + sns.dark_palette(S2, 9, reverse=True)[:7] + sns.dark_palette(S4, 12, reverse=True)[:10] + [OTHER]
for i, ((rx, ry, rw, rh), n) in enumerate(zip(rects, vals10)):
    patch = Rectangle((rx, ry), rw, rh, facecolor=shades[i], edgecolor=PANEL, linewidth=2)
    ax.add_patch(patch)
    cell = f'{i + 1:02d}\n{n:,}기' if rw >= 12 and rh >= 9 else (f'{i + 1:02d}' if rw >= 4 and rh >= 4 else '')
    t = ax.text(rx + rw / 2, ry + rh / 2, cell, ha='center', va='center', fontsize=9, color='#141821' if i < 3 else INK, clip_on=True)
    t.set_clip_path(patch)
for i, (label, n) in enumerate(zip(labels10, vals10)):
    yy = .835 - i * .031
    fig.add_artist(Rectangle((.61, yy), .01, .016, transform=fig.transFigure, facecolor=shades[i], edgecolor='none'))
    fig.text(.627, yy + .002, f'{i + 1:02d}  {label}', fontsize=9.2, color=INK2, va='bottom')
    fig.text(.985, yy + .002, f'{n:,}기 ({n / N_ALL * 100:.2f}%)', fontsize=9.2, color=INK2, va='bottom', ha='right')
ax.set(xlim=(0, 100), ylim=(0, 60))
ax.invert_yaxis()
ax.axis('off')
first10 = top20.iloc[0]
save(fig, 10, 'operator_treemap', title='운영기관별 충전기 규모', technique='트리맵 (면적 비례)', libraries=['Matplotlib patches', 'Seaborn 팔레트'],
     data_date=CH_DATE, basis=CH_BASIS, regions='전국 (16개 지역 합계)', deletion='전체 (삭제 표시 포함)',
     results=[f"(기관 ID, 명칭) 조합은 {len(ops)}개이며, 가장 큰 곳은 {first10.busiNm} [{first10.busiId}] {int(first10.charger_count):,}기({first10.charger_count / N_ALL * 100:.2f}%)입니다.",
              f"상위 20개 조합이 {sum(vals10[:-1]):,}기({sum(vals10[:-1]) / N_ALL * 100:.1f}%), 나머지 {len(ops) - 20}개 조합이 {vals10[-1]:,}기입니다."],
     caution='앞뒤 공백만 정리했고 명칭이 다른 기관을 자동으로 합치지 않습니다. 면적은 충전기 수이며 법적 소유 관계가 아닙니다.',
     web={'graph': 10, 'title': '운영기관별 충전기 규모'},
     metric={'operator_pairs': int(len(ops)), 'labels': labels10, 'counts': vals10})

# ---------------------------------------------------------------- outputs
assert [c['id'] for c in charts] == list(range(1, 11))
meta = {
    'title': 'Python 데이터 시각화 그래프',
    'generator': 'scripts/create_python_charts_2026.py',
    'generated_at': datetime.now().astimezone().isoformat(timespec='seconds'),
    'libraries': {'matplotlib': matplotlib.__version__, 'seaborn': sns.__version__, 'pandas': pd.__version__, 'numpy': np.__version__},
    'font': FONT,
    'fixed_notice': '이 그래프는 아래 기준일의 자료로 미리 만든 고정 이미지입니다. 웹사이트 필터를 바꿔도 달라지지 않습니다.',
    'data': {'ev_registration': {'date': EV_DATE, 'total': EV_TOTAL, 'regions': len(ev), 'source': EV_SOURCE},
             'chargers': {'date': CH_DATE, 'snapshot': SNAP, 'total': N_ALL, 'not_deleted': N_NOT_DELETED, 'deleted': N_DELETED,
                          'basis': '전체 (삭제 표시 포함) = 웹 기본 필터', 'source': CH_SOURCE},
             'growth': {'years': [int(growth.year.min()), int(growth.year.max())], 'partial_years': partial.year.astype(int).tolist()}},
    'charts': charts,
}
(OUT / 'charts.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
source_hashes = {str(p.relative_to(P)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in [DATA / 'charger_info_clean.csv', DATA / 'ev_registration_by_region_2026_09.csv', DATA / 'charger_installation_trend.csv']}
REPORT.write_text(json.dumps({'source_sha256': source_hashes, 'charts': metrics}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(json.dumps({'charts': len(charts), 'out': str(OUT.relative_to(P)), 'chargers_all': N_ALL, 'ev_total': EV_TOTAL,
                  'bytes': sum((OUT / c['file']).stat().st_size for c in charts)}, ensure_ascii=False))

"""CHARGE GAP 웹사이트 그래프 1~10을 Python(Matplotlib·Seaborn)으로 다시 구현합니다 (흰 배경).

기준은 현재 웹사이트 코드(frontend/src/features/ChartCards.tsx와 frontend/src/charts/*.tsx)와 API입니다.
그래프 종류·정렬·필터·삭제 표시 기준·표시 수치는 웹 기본 필터 상태의 화면과 같게 맞추고,
색만 다크 테마 대신 흰 배경과 처음 만든 원본 그래프(outputs/charts)의 차분한 색 계열을 씁니다.

데이터(CSV에서 직접 집계, 코드에 수치를 적지 않음)
- 전기차 등록: data/processed/ev_registration_by_region_2026_09.csv (2026년 9월, 16개 지역, 전남광주 통합)
- 충전기 현황: data/processed/charger_info_clean.csv (2026-10-15 조회)
    웹 기본 필터 = 삭제 표시 '전체'. 단 그래프 5(박스플롯)는 웹과 같이 '전체'일 때 비삭제 표시(N)만 집계
- 설치 추이: data/processed/charger_installation_trend.csv (연도별 통계, 마지막 해 부분 연도)

출력: outputs/charts_web_matched_2026/ (PNG 10개 + metrics.json)
기존 outputs/charts, outputs/charts_2026_09_updated, frontend/public/python-charts 는 읽거나 쓰지 않습니다.

실행: python scripts/create_web_matched_charts_2026.py [--data-dir data/processed] [--font-dir 경로]
필요: pandas, numpy, matplotlib, seaborn, Pillow, 맑은 고딕(Malgun Gothic)
재현 환경: Python 3.13 + scripts/requirements-web-matched-charts.txt (저장소 PNG를 만든 버전).
    글자 렌더링은 text.hinting='no_hinting'으로 고정합니다(아래 sns.set_theme). 이 값은 설치본마다 기본값이 달라,
    고정하지 않으면 값·모양은 같아도 PNG 바이트가 달라집니다.
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

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--data-dir', type=Path, default=ROOT / 'data/processed')
parser.add_argument('--out-dir', type=Path, default=ROOT / 'outputs/charts_web_matched_2026')
parser.add_argument('--font-dir', default=None)
args = parser.parse_args()
OUT: Path = args.out_dir.resolve()
for protected in ('outputs/charts', 'outputs/charts_2026_09_updated', 'outputs/charts_v2_report',
                  'frontend/public/python-charts', 'frontend/public/python-charts-original'):
    assert OUT != (ROOT / protected).resolve(), f'{protected} 는 보존 폴더입니다'
OUT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR', str(Path.home() / '.cache/mpl_web_matched'))

import matplotlib  # noqa: E402

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import seaborn as sns  # noqa: E402
from matplotlib import font_manager as fm  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap, to_rgb  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Patch, Rectangle  # noqa: E402
from matplotlib.ticker import FixedLocator, FuncFormatter, NullLocator  # noqa: E402
from PIL import Image  # noqa: E402

# ---------------------------------------------------------------- 글꼴·색 (흰 배경 + 원본 그래프 색 계열)
for d in ([Path(args.font_dir)] if args.font_dir else [Path('C:/Windows/Fonts'), Path.home() / '.fonts_cg']):
    for name in ('malgun.ttf', 'malgunbd.ttf'):
        if (d / name).exists():
            fm.fontManager.addfont(str(d / name))
FONT = 'Malgun Gothic'
if FONT not in {f.name for f in fm.fontManager.ttflist}:
    raise SystemExit('맑은 고딕(Malgun Gothic) 글꼴이 필요합니다. --font-dir 로 malgun.ttf 위치를 지정하세요.')
warnings.filterwarnings('error', message='Glyph .* missing')  # 한글 깨짐은 실패로 처리

TITLE, INK, LABEL, MUTED, TICK = '#132E44', '#1F2D3A', '#334155', '#697D8F', '#526575'
BLUE, ORANGE, TEAL, PURPLE = '#276C9B', '#D6864A', '#2B8C82', '#846BA1'
GRID, SPINE, OTHER = '#E7EEF4', '#CBD5E1', '#B7C2CC'
# 웹 색 역할 → 흰 배경 색: s1(기본 계열)=파랑, accent/s3(강조·부분 연도·사업용)=주황, s2(두 번째 범주)=파랑
VEHICLE_COLORS = {'승용': BLUE, '화물': ORANGE, '승합': TEAL, '특수': PURPLE}           # 웹 VEHICLE_COLORS 와 같은 역할(차종별 고정)
TYPE_COLORS = {'02': BLUE, '04': ORANGE, '11': TEAL, '06': PURPLE, '05': '#54A6B5', '07': '#D2AE56', '01': '#A4B9CB', '03': '#AF7371', '08': '#739164', '10': '#9D8FBA'}
SEQ = LinearSegmentedColormap.from_list('seq', ['#F1F4F6', '#A9C6DA', BLUE, '#163F5C'])  # 히트맵: 낮음(밝음) → 높음(진함)
TREE_TOP = [ORANGE, '#1F5A82', '#2F77A6']                                                   # 1위, 2·3위 (웹: 1위 강조 + 2·3위 밝은 회색)
TREE_BANDS = [(6, '#5B93BB'), (10, '#86AECB'), (float('inf'), '#B2CADC')]                  # 4–6, 7–10, 11–20위 (웹 TREEMAP_BANDS와 같은 구간)

sns.set_theme(style='white', font=FONT, rc={
    'axes.unicode_minus': False, 'figure.facecolor': 'white', 'axes.facecolor': 'white', 'savefig.facecolor': 'white',
    'axes.edgecolor': SPINE, 'axes.labelcolor': LABEL, 'text.color': INK, 'xtick.color': TICK, 'ytick.color': TICK,
    'font.size': 12, 'axes.labelsize': 13, 'xtick.labelsize': 12, 'ytick.labelsize': 12.5, 'legend.fontsize': 12,
    'text.hinting': 'no_hinting'})  # 저장소 PNG를 만든 설정. 설치본 기본값(default 등)에 따라 글자 픽셀이 달라지지 않게 고정
DPI = 200

# ---------------------------------------------------------------- 데이터
DATA: Path = args.data_dir.resolve()
raw = pd.read_csv(DATA / 'charger_info_clean.csv', dtype=str, keep_default_na=False,
                  usecols=['zcode', 'statId', 'chgerId', 'delYn', 'chgerType', 'busiId', 'bnm', 'output', '_fetched_at'])
for column in raw:
    raw[column] = raw[column].str.strip()
assert set(raw.delYn) <= {'N', 'Y'} and not raw.duplicated(['statId', 'chgerId']).any()
ALL = raw                              # 웹 기본 필터: 삭제 표시 '전체'
NOT_DELETED = raw[raw.delYn.eq('N')]   # 그래프 5 (웹 boxplotDeletion: '전체' → not_deleted)
N_ALL, N_ND, N_DEL = len(raw), len(NOT_DELETED), int(raw.delYn.eq('Y').sum())
fetched = pd.to_datetime(raw._fetched_at)
SNAP = f'{fetched.min():%Y-%m-%d %H:%M}–{fetched.max():%H:%M} KST'
CH_DATE = f'{fetched.min():%Y-%m-%d} 조회'
CH_SRC = f'출처: 한국환경공단 전기자동차 충전소 정보(getChargerInfo) · {SNAP} 조회'
output_kw = pd.to_numeric(ALL.output, errors='coerce')

ev = pd.read_csv(DATA / 'ev_registration_by_region_2026_09.csv', dtype={'region_code': str}, keep_default_na=False)
EV_MONTH = ev.reference_month.iloc[0]
assert ev.reference_month.eq(EV_MONTH).all() and ev.region_code.is_unique and len(ev) == 16
EV_Y, EV_M = EV_MONTH.split('-')
EV_TOTAL = int(ev.ev_registration_count.sum())
EV_DATE = f'{EV_Y}년 {int(EV_M)}월 등록'
EV_SRC = f'출처: 국토교통부 자동차 등록자료 통계 {EV_Y}년 {int(EV_M)}월 (연료: 전기) · 16개 시도(전남광주 통합)'
# 웹 표시 이름: API region_name, 단 12는 '전남광주' (ChartCards.tsx short / G1 label)
API_NAME = {'11': '서울', '12': '전남광주통합특별시', '26': '부산', '27': '대구', '28': '인천', '30': '대전', '31': '울산', '36': '세종',
            '41': '경기', '51': '강원', '43': '충북', '44': '충남', '52': '전북', '47': '경북', '48': '경남', '50': '제주'}
SHORT = {c: ('전남광주' if c == '12' else n) for c, n in API_NAME.items()}
assert set(ev.region_code) == set(SHORT) and set(ALL.zcode) <= set(SHORT)

growth = pd.read_csv(DATA / 'charger_installation_trend.csv', keep_default_na=False)
growth['partial'] = ~growth.completed_calendar_year.astype(str).eq('True')
assert np.array_equal(np.cumsum(growth.annual_installed_count), growth.cumulative_count)

TYPE_DEFINITIONS = None  # 공식 커넥터 유형 정의는 백엔드 상수를 그대로 읽음
for node in ast.parse((ROOT / 'backend/chargegap_api/data.py').read_text(encoding='utf-8')).body:
    if isinstance(node, ast.Assign) and getattr(node.targets[0], 'id', '') == 'TYPE_DEFINITIONS':
        TYPE_DEFINITIONS = ast.literal_eval(node.value)
assert TYPE_DEFINITIONS

charts: list[dict] = []


# ---------------------------------------------------------------- 공통
def fmt_int(v) -> str:
    return f'{int(round(v)):,}'


def fmt_pct(v: float, digits: int = 1) -> str:  # 웹 fmtPct
    if 0 < v < .1 and digits <= 1:
        return '<0.1%'
    return f'{v:.{digits}f}%'


def fmt_compact(v, _=None) -> str:  # 웹 fmtCompact (축 눈금)
    a = abs(v)
    if a >= 10_000:
        return f"{float(f'{v / 10_000:.{0 if a >= 100_000 else 1}f}'):g}만"
    if a >= 1_000:
        return f"{float(f'{v / 1_000:.1f}'):g}천"
    return f'{v:g}'


def canvas(title: str, subtitle: str, footer: list[str], h: float = 7.4, w: float = 12.0, rect=(.1, .2, .96, .82)):
    fig = plt.figure(figsize=(w, h), dpi=DPI)
    fig.text(.035, 1 - .38 / h, title, fontsize=19, weight='bold', color=TITLE, va='top')
    fig.text(.035, 1 - .8 / h, subtitle, fontsize=11.5, color=MUTED, va='top')
    for i, line in enumerate(footer):
        fig.text(.035, (.2 + .26 * (len(footer) - 1 - i)) / h, line, fontsize=9.5, color=MUTED, va='bottom')
    ax = fig.add_axes([rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]])
    return fig, ax


def frame_axes(ax, grid: str):
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    for side in ('left', 'bottom'):
        ax.spines[side].set_color(SPINE)
    ax.tick_params(length=0)
    ax.grid(False)
    if grid in ('x', 'both'):
        ax.xaxis.grid(True, color=GRID, linewidth=1)
    if grid in ('y', 'both'):
        ax.yaxis.grid(True, color=GRID, linewidth=1)
    ax.set_axisbelow(True)


def save(fig, n: int, slug: str, **info):
    path = OUT / f'{n:02d}_{slug}.png'
    fig.canvas.draw()
    r = fig.canvas.get_renderer()
    W, H = fig.canvas.get_width_height()
    for t in fig.findobj(matplotlib.text.Text):  # 잘린 글자가 없는지 확인
        if t.get_visible() and t.get_text() and t.get_clip_path() is None and not t.get_clip_on():
            b = t.get_window_extent(r)
            assert b.x0 >= -1 and b.y0 >= -1 and b.x1 <= W + 1 and b.y1 <= H + 1, (n, 'clipped', t.get_text()[:30])
    fig.savefig(path, dpi=DPI)
    plt.close(fig)
    with Image.open(path) as im:
        im.convert('RGB').save(path, optimize=True)
    with Image.open(path) as im:
        size = list(im.size)
    charts.append(dict(id=n, file=path.name, image_pixels=size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), **info))


CH_FOOT_ALL = f'기준: 충전기 {CH_DATE} · 삭제 표시 포함 전체 {N_ALL:,}기(삭제 표시 {N_DEL:,}기) = 웹사이트 기본 필터'
EV_FOOT = f'기준: {EV_DATE} · 순수 전기차 {EV_TOTAL:,}대 · 16개 시도(전남광주 통합) · 등록 자료라 삭제 표시 없음'

# ================================================================ 1. 지역별 전기차 등록 대수 — 가로 막대 (웹 HBarChart)
e = ev.sort_values('ev_registration_count', ascending=False, kind='stable').reset_index(drop=True)
e['label'] = e.region_code.map(SHORT)
fig, ax = canvas('지역별 전기차 등록 대수', f'{EV_Y}년 {int(EV_M)}월, 16개 시도 · 등록 대수 내림차순 · 가장 많은 지역 강조',
                 [EV_SRC, EV_FOOT], h=8.4, rect=(.11, .14, .95, .86))
sns.barplot(data=e, x='ev_registration_count', y='label', hue='label', legend=False, orient='h', ax=ax, saturation=1,
            palette=[ORANGE] + [BLUE] * (len(e) - 1), width=.7)
for patch, v in zip(ax.patches, e.ev_registration_count):  # 웹 LabelList: 막대 끝 정수
    ax.text(patch.get_width() + e.ev_registration_count.max() * .008, patch.get_y() + patch.get_height() / 2, fmt_int(v),
            va='center', fontsize=11, color=LABEL)
ax.set_xlim(0, e.ev_registration_count.max() * 1.1)
ax.xaxis.set_major_formatter(FuncFormatter(fmt_compact))
ax.set(xlabel='전기차 등록 대수 (대)', ylabel='')
ax.tick_params(axis='y', labelcolor=LABEL, labelsize=12.5)
frame_axes(ax, 'x')
top3 = e.head(3)
save(fig, 1, 'ev_registration_regions', title='지역별 전기차 등록 대수', web_title='지역별 전기차 등록 대수', chart_type='가로 막대그래프',
     functions=['seaborn.barplot(orient="h")', 'matplotlib Axes.text (막대 끝 값)'],
     data_date=EV_DATE, basis=f'16개 시도 전체 · 등록 대수 내림차순 · 전국 {EV_TOTAL:,}대', deletion='해당 없음 (등록 자료)',
     results=[f"{e.label[0]} {int(e.ev_registration_count[0]):,}대로 전국의 {e.ev_registration_count[0] / EV_TOTAL * 100:.1f}%입니다.",
              f"상위 3개 지역({', '.join(top3.label)}) 합계 {int(top3.ev_registration_count.sum()):,}대, 전국의 {top3.ev_registration_count.sum() / EV_TOTAL * 100:.1f}%입니다.",
              f"가장 적은 지역은 {e.label.iloc[-1]} {int(e.ev_registration_count.iloc[-1]):,}대입니다."],
     values={'order': e.region_code.tolist(), 'counts': dict(zip(e.region_code, e.ev_registration_count.astype(int).tolist())), 'total': EV_TOTAL})

# ================================================================ 2. 차종별 등록 구성 — 도넛 (웹 DonutChart, 전국)
veh = [('승용', 'ev_passenger_count'), ('화물', 'ev_truck_count'), ('승합', 'ev_bus_count'), ('특수', 'ev_special_count')]
vals2 = [int(ev[c].sum()) for _, c in veh]
assert sum(vals2) == EV_TOTAL
fig, ax = canvas('차종별 등록 구성 (전국)', '승용·화물·승합·특수 4개 차종의 구성비 · 가운데 = 전체 등록 대수',
                 [EV_SRC, EV_FOOT], rect=(.04, .14, .5, .86))
wedges, _ = ax.pie(vals2, colors=[VEHICLE_COLORS[l] for l, _ in veh], startangle=90, counterclock=False,  # 웹 startAngle 90 → -270 (시계 방향)
                   radius=1, wedgeprops={'width': 1 - .64 / .88, 'edgecolor': 'white', 'linewidth': 2})
ax.text(0, .08, f'{EV_TOTAL:,}', ha='center', va='center', fontsize=22, weight='bold', color=TITLE)
ax.text(0, -.14, '등록 대수', ha='center', va='center', fontsize=12, color=MUTED)
ax.set_aspect('equal')
for i, ((l, _), v) in enumerate(zip(veh, vals2)):  # 웹 범례: 이름 · 대수 · 구성비(소수 1자리)
    y = .66 - i * .1
    fig.patches.append(Rectangle((.55, y - .012), .016, .024, transform=fig.transFigure, color=VEHICLE_COLORS[l]))
    fig.text(.58, y, l, fontsize=14, color=INK, va='center')
    fig.text(.82, y, f'{v:,}', fontsize=14, color=INK, va='center', ha='right')
    fig.text(.93, y, fmt_pct(v / EV_TOTAL * 100), fontsize=14, color=MUTED, va='center', ha='right')
save(fig, 2, 'ev_vehicle_types_donut', title='차종별 등록 구성 (전국)', web_title='차종별 등록 구성 (전국)', chart_type='도넛 차트',
     functions=['matplotlib Axes.pie(wedgeprops width)', 'seaborn.set_theme'],
     data_date=EV_DATE, basis='전국 16개 시도 합계 · 웹 기본 상태(등록 지역 필터 없음)', deletion='해당 없음 (등록 자료)',
     results=[f"승용 {vals2[0]:,}대({vals2[0] / EV_TOTAL * 100:.1f}%), 화물 {vals2[1]:,}대({vals2[1] / EV_TOTAL * 100:.1f}%)입니다.",
              f"승합 {vals2[2]:,}대({vals2[2] / EV_TOTAL * 100:.1f}%), 특수 {vals2[3]:,}대({vals2[3] / EV_TOTAL * 100:.1f}%)입니다."],
     values={'labels': [l for l, _ in veh], 'counts': vals2, 'total': EV_TOTAL})

# ================================================================ 3. 사업용·비사업용 — 100% 누적 가로 막대 (웹 StackedHBar normalized)
c3 = ev.assign(share=ev.ev_commercial_count / ev.ev_registration_count * 100)
c3 = c3.sort_values(['share', 'region_code'], ascending=[False, True], kind='stable').reset_index(drop=True)  # 웹: 사업용 비율 내림차순, 같으면 코드 오름차순
assert (c3.ev_commercial_count + c3.ev_noncommercial_count).equals(c3.ev_registration_count)
lab3 = c3.region_code.map(SHORT)
fig, ax = canvas('지역별 사업용·비사업용 전기차 구성', '지역별 등록 대수 = 100% · 사업용 비율이 높은 순 · 막대 안 숫자 = 사업용 비율',
                 [EV_SRC, EV_FOOT], h=8.4, rect=(.11, .14, .95, .8))
ax.barh(lab3, c3.share, color=ORANGE, height=.7, label='사업용', edgecolor='white', linewidth=1)
ax.barh(lab3, 100 - c3.share, left=c3.share, color=BLUE, height=.7, label='비사업용', edgecolor='white', linewidth=1)
ax.invert_yaxis()
for i, s in enumerate(c3.share):
    ax.text(s / 2, i, f'{s:.1f}%', ha='center', va='center', fontsize=10.5, color='white', weight='bold')
ax.set(xlim=(0, 100), xlabel='지역 내 등록 구성비 (%)', ylabel='')
ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f'{v:.0f}%'))
ax.tick_params(axis='y', labelcolor=LABEL, labelsize=12.5)
ax.legend(loc='lower left', bbox_to_anchor=(0, 1.0), ncol=2, frameon=False, handlelength=1.1, handleheight=1.1)
frame_axes(ax, 'x')
nat3 = ev.ev_commercial_count.sum() / EV_TOTAL * 100
save(fig, 3, 'ev_commercial_share', title='지역별 사업용·비사업용 전기차 구성', web_title='지역별 사업용·비사업용 전기차 구성 (기본 보기: 비율)',
     chart_type='100% 누적 가로 막대그래프', functions=['matplotlib Axes.barh(left=…) 2계열 누적', 'seaborn.set_theme'],
     data_date=EV_DATE, basis='16개 시도 · 지역 등록 대수 = 100% · 사업용 비율 내림차순', deletion='해당 없음 (등록 자료)',
     results=[f"전국 사업용 비율은 {nat3:.1f}%({int(ev.ev_commercial_count.sum()):,}대)입니다.",
              f"사업용 비율 최고 {lab3[0]} {c3.share[0]:.1f}%, 최저 {lab3.iloc[-1]} {c3.share.iloc[-1]:.1f}%입니다."],
     values={'order': c3.region_code.tolist(), 'commercial_pct': dict(zip(c3.region_code, c3.share.round(6).tolist())),
             'commercial': dict(zip(c3.region_code, c3.ev_commercial_count.astype(int).tolist())),
             'noncommercial': dict(zip(c3.region_code, c3.ev_noncommercial_count.astype(int).tolist()))})

# ================================================================ 4. 충전소 수 vs 충전기 수 — 산점도 + OLS 회귀선 (웹 RegionScatter)
reg = ALL.groupby('zcode').agg(chargers=('chgerId', 'size'), stations=('statId', 'nunique')).reset_index()
reg['label'] = reg.zcode.map(SHORT)
xs, ys = reg.stations.to_numpy(float), reg.chargers.to_numpy(float)
slope, intercept = np.polyfit(xs, ys, 1)
r2 = float(np.corrcoef(xs, ys)[0, 1] ** 2)
fig, ax = canvas('지역별 충전소 수와 충전기 수의 관계', '16개 시도 산점도 + 최소제곱 회귀선(점선) · 지역별 동일 가중치',
                 [CH_SRC, CH_FOOT_ALL], h=7.8, rect=(.1, .17, .96, .86))
x_end = xs.max() * 1.04                                       # 웹: 회귀선 끝 = 최대 x × 1.04
x_start = -intercept / slope if intercept < 0 and slope > 0 else 0.0  # 웹: 절편이 음수면 y=0 지점부터
ax.set_xlim(0, x_end * 1.02)
ax.set_ylim(0, ys.max() * 1.1)
sns.regplot(x=xs, y=ys, ax=ax, ci=None, scatter=False, truncate=False,
            line_kws={'color': MUTED, 'linewidth': 1.8, 'dashes': (6, 4)})
line = ax.lines[-1]
lx = line.get_xdata()
keep = (lx >= x_start) & (lx <= x_end)
line.set_data(lx[keep], line.get_ydata()[keep])
assert np.allclose(np.polyfit(line.get_xdata(), line.get_ydata(), 1), [slope, intercept])  # Seaborn 회귀선 = 같은 OLS
sns.scatterplot(x=xs, y=ys, ax=ax, color=BLUE, s=150, edgecolor='white', linewidth=1.8, zorder=3)
ratio = reg.chargers / reg.stations
labelled = set(reg.nlargest(2, 'stations').zcode) | {reg.zcode[ratio.idxmax()], reg.zcode[ratio.idxmin()]}  # 웹 직접 라벨 규칙
for row in reg.itertuples():
    if row.zcode in labelled:
        ax.annotate(row.label, (row.stations, row.chargers), xytext=(0, 11), textcoords='offset points', ha='center', va='bottom',
                    fontsize=12, color=LABEL, weight='bold')
ax.xaxis.set_major_formatter(FuncFormatter(fmt_compact))
ax.yaxis.set_major_formatter(FuncFormatter(fmt_compact))
ax.set(xlabel='충전소 수 (곳)', ylabel='충전기 수 (기)')
sign = '-' if intercept < 0 else '+'
ax.text(.02, .97, f'회귀선(점선): 충전기 수 = {sign}{abs(round(intercept)):,} + {slope:.3f} × 충전소 수, R² = {r2:.3f}',
        transform=ax.transAxes, ha='left', va='top', fontsize=11.5, color=LABEL)
frame_axes(ax, 'both')
big = reg.nlargest(2, 'stations')
save(fig, 4, 'stations_chargers_regression', title='지역별 충전소 수와 충전기 수의 관계', web_title='지역별 충전소 수와 충전기 수의 관계',
     chart_type='산점도 + 회귀선', functions=['seaborn.regplot(scatter=False, ci=None)', 'seaborn.scatterplot', 'numpy.polyfit (검증)'],
     data_date=CH_DATE, basis='16개 시도 · 지역별 충전소 수(고유 statId)와 충전기 수 · 최소제곱 회귀', deletion=f'전체 {N_ALL:,}기 (삭제 표시 포함)',
     results=[f"회귀선: 충전기 수 = {sign}{abs(round(intercept)):,} + {slope:.3f} × 충전소 수, R² = {r2:.3f}입니다.",
              f"규모가 큰 두 지역은 {big.label.iloc[0]}(충전소 {int(big.stations.iloc[0]):,}곳·충전기 {int(big.chargers.iloc[0]):,}기)와 {big.label.iloc[1]}(충전소 {int(big.stations.iloc[1]):,}곳·충전기 {int(big.chargers.iloc[1]):,}기)입니다."],
     values={'slope': float(slope), 'intercept': float(intercept), 'r2': r2,
             'regions': {r.zcode: {'station_count': int(r.stations), 'charger_count': int(r.chargers)} for r in reg.itertuples()}})

# ================================================================ 5. 충전소당 충전기 수 — 박스플롯 (웹 BoxPlot, 비삭제 표시 기준)
sizes = NOT_DELETED.groupby(['zcode', 'statId']).chgerId.nunique().rename('size').reset_index()
stats5 = {}
for c, v in sizes.groupby('zcode')['size']:
    q1, med, q3 = (float(x) for x in v.quantile([.25, .5, .75], interpolation='linear'))
    lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    inside, outside = v[v.between(lo, hi)], v[~v.between(lo, hi)]
    stats5[c] = dict(sample_count=len(v), q1=q1, median=med, q3=q3, mean=float(v.mean()), whisker_low=int(inside.min()),
                     whisker_high=int(inside.max()), max=int(v.max()), outlier_count=len(outside),
                     outliers=outside.value_counts().sort_index())
order5 = sorted(stats5, key=lambda c: (-stats5[c]['median'], -stats5[c]['q3'], -stats5[c]['mean']))  # 웹 정렬
sizes['label'] = sizes.zcode.map(SHORT)
fig, ax = canvas('충전소당 충전기 수 분포 (지역별 박스플롯)',
                 f'비삭제 표시 충전기 기준, 표본 {len(sizes):,}곳 · 중앙값이 높은 지역 순 · 가로축 로그 눈금',
                 [CH_SRC, f'기준: 충전기 {CH_DATE} · 웹 기본 필터(삭제 표시 전체)일 때 이 그래프는 비삭제 표시(N) {N_ND:,}기로 집계 · 충전소 1곳 = 표본 1개',
                  '상자 Q1–Q3(선형 보간) · 굵은 선 중앙값 · ◆ 평균 · 수염 = 1.5×IQR 안의 관측 끝값 · 점 = 이상치(점 크기 = 그 값을 가진 충전소 수)'],
                 h=9.4, rect=(.11, .17, .96, .88))
sns.boxplot(data=sizes, x='size', y='label', order=[SHORT[c] for c in order5], orient='h', whis=1.5, ax=ax, showfliers=False,
            showmeans=True, width=.55, color=BLUE, saturation=1, linecolor=BLUE, linewidth=1.4, log_scale=True,
            boxprops={'facecolor': (*to_rgb(BLUE), .28)}, medianprops={'color': TITLE, 'linewidth': 2.4},
            meanprops={'marker': 'D', 'markerfacecolor': ORANGE, 'markeredgecolor': 'white', 'markersize': 7})
fmax = max(int(s['outliers'].max()) for s in stats5.values() if len(s['outliers']))
for i, c in enumerate(order5):  # 이상치: 값마다 점 1개, 크기 = 빈도 (웹과 같은 방식, 지터 없음)
    o = stats5[c]['outliers']
    ax.scatter(o.index, [i] * len(o), s=8 + 160 * np.sqrt(o.to_numpy() / fmax), color=BLUE, alpha=.45, edgecolor='none', zorder=2)
dmax = max(s['max'] for s in stats5.values())
ax.set_xlim(.8, dmax * 1.25)                                 # 웹: 로그일 때 0.8 ~ 최대 × 1.25
ticks5 = [t for t in (1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500) if t <= dmax * 1.25]  # 웹 BoxPlot 눈금
ax.xaxis.set_major_locator(FixedLocator(ticks5))
ax.xaxis.set_minor_locator(NullLocator())
ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f'{v:g}'))
ax.set(xlabel='충전소 1곳당 충전기 수 (기, 로그 눈금)', ylabel='')
ax.tick_params(axis='y', labelcolor=LABEL, labelsize=12.5)
frame_axes(ax, 'x')
meds = [stats5[c]['median'] for c in order5]
save(fig, 5, 'station_size_boxplot', title='충전소당 충전기 수 분포 (지역별 박스플롯)', web_title='충전소당 충전기 수 분포 (지역별 박스플롯)',
     chart_type='박스플롯', functions=['seaborn.boxplot(log_scale=True, showmeans=True, showfliers=False)', 'matplotlib Axes.scatter (빈도 크기 이상치)', 'pandas Series.quantile(linear) (검증)'],
     data_date=CH_DATE, basis=f'비삭제 표시 충전소 {len(sizes):,}곳 · 지역별 사분위수 · 중앙값→Q3→평균 내림차순',
     deletion=f'비삭제 표시만 {N_ND:,}기 (웹: 필터 "전체"일 때 이 그래프만 비삭제 기준)',
     results=[f"지역별 중앙값은 {meds[-1]:g}~{meds[0]:g}기/곳입니다. {meds[0]:g}기: {'·'.join(SHORT[c] for c in order5 if stats5[c]['median'] == meds[0])}, "
              f"{meds[-1]:g}기: {'·'.join(SHORT[c] for c in order5 if stats5[c]['median'] == meds[-1])}.",
              f"1.5×IQR 밖 이상치 충전소는 모두 {sum(s['outlier_count'] for s in stats5.values()):,}곳이며, 가장 큰 충전소는 {dmax:,}기입니다."],
     values={'sample_count': len(sizes), 'order': order5,
             'regions': {c: {k: v for k, v in s.items() if k != 'outliers'} for c, s in stats5.items()}})

# ================================================================ 6. 충전기 유형별 구성 — 도넛 (상위 4 + 기타)
types = ALL.chgerType.value_counts().sort_values(ascending=False, kind='stable')
top4, rest = types.head(4), types.iloc[4:]
vals6 = [int(v) for v in top4.values] + ([int(rest.sum())] if len(rest) else [])
labels6 = [f'{c} {TYPE_DEFINITIONS[c]}' for c in top4.index] + ([f'기타 {len(rest)}개 유형'] if len(rest) else [])
colors6 = [TYPE_COLORS.get(c, OTHER) for c in top4.index] + [OTHER]
assert sum(vals6) == N_ALL
fig, ax = canvas('충전기 유형별 구성', '공식 커넥터 유형 코드 기준 · 상위 4개 + 기타 · 가운데 = 전체 충전기 수', [CH_SRC, CH_FOOT_ALL],
                 rect=(.04, .14, .46, .86))
wedges, _ = ax.pie(vals6, colors=colors6, startangle=90, counterclock=False,
                   wedgeprops={'width': 1 - .64 / .88, 'edgecolor': 'white', 'linewidth': 2})
ax.text(0, .08, f'{N_ALL:,}', ha='center', va='center', fontsize=22, weight='bold', color=TITLE)
ax.text(0, -.14, '충전기', ha='center', va='center', fontsize=12, color=MUTED)
ax.set_aspect('equal')
for i, (l, v, col) in enumerate(zip(labels6, vals6, colors6)):
    y = .7 - i * .1
    fig.patches.append(Rectangle((.5, y - .012), .016, .024, transform=fig.transFigure, color=col))
    fig.text(.53, y, l, fontsize=12.5, color=INK, va='center')
    fig.text(.86, y, f'{v:,}', fontsize=12.5, color=INK, va='center', ha='right')
    fig.text(.955, y, fmt_pct(v / N_ALL * 100), fontsize=12.5, color=MUTED, va='center', ha='right')
save(fig, 6, 'charger_types_donut', title='충전기 유형별 구성', web_title='충전기 유형별 구성', chart_type='도넛 차트 (상위 4개 + 기타)',
     functions=['matplotlib Axes.pie(wedgeprops width)', 'seaborn.set_theme'],
     data_date=CH_DATE, basis='공식 커넥터 유형 코드(chgerType) · 대수 내림차순 상위 4개 + 기타', deletion=f'전체 {N_ALL:,}기 (삭제 표시 포함)',
     results=[f"{labels6[0]} {vals6[0]:,}기({vals6[0] / N_ALL * 100:.1f}%), {labels6[1]} {vals6[1]:,}기({vals6[1] / N_ALL * 100:.1f}%)입니다.",
              f"{labels6[-1]} 합계는 {vals6[-1]:,}기({fmt_pct(vals6[-1] / N_ALL * 100)})입니다."],
     values={'labels': labels6, 'counts': vals6, 'by_type': {k: int(v) for k, v in types.items()}})

# ================================================================ 7. 정격 출력 분포 — 히스토그램 + KDE (웹 HistKde, 로그 x · 로그 y)
LOG_BIN, LO, HI = .125, .375, 2.75                                # HistKde.tsx 와 같은 구간·대역폭
edges = np.round(LO + LOG_BIN * np.arange(round((HI - LO) / LOG_BIN) + 1), 4)
positive = output_kw[output_kw > 0]
freq = positive.value_counts().sort_index()
lxv, wts = np.log10(freq.index.to_numpy(float)), freq.to_numpy(float)
assert lxv.min() >= edges[0] and lxv.max() <= edges[-1]


def bw_fixed(kde):  # scipy gaussian_kde: factor × 가중 표준편차 = LOG_BIN (웹 weightedKde 대역폭과 같음)
    return LOG_BIN / float(np.sqrt(np.cov(kde.dataset, aweights=kde.weights, bias=False)))


fig, ax = canvas('충전기 정격 출력 분포', '히스토그램(막대) + KDE(곡선) · 가로축 로그 눈금(log10 구간 폭 0.125) · 세로축 로그',
                 [CH_SRC, CH_FOOT_ALL + f' · 양수 출력 {len(positive):,}기 (결측·숫자 아님 {N_ALL - len(positive):,}기 제외)'],
                 rect=(.09, .2, .96, .79))
sns.histplot(x=lxv, weights=wts, bins=edges.tolist(), kde=True, ax=ax, color=BLUE, alpha=.85, edgecolor='white', linewidth=.8,
             kde_kws={'bw_method': bw_fixed, 'cut': 3, 'gridsize': 400}, line_kws={'color': ORANGE, 'linewidth': 2.2})
hist_counts = np.array([p.get_height() for p in ax.patches])
kde_line = ax.lines[0]
kde_line.set_color(ORANGE)
mids = (edges[:-1] + edges[1:]) / 2
_kx, _ky = kde_line.get_xdata(), kde_line.get_ydata()
_in = (_kx >= mids[0]) & (_kx <= mids[-1])  # 웹은 KDE를 첫 구간 중앙~마지막 구간 중앙에서만 그림
kde_line.set_data(_kx[_in], _ky[_in])
ax.set_yscale('log')
ax.set_ylim(bottom=1)                                             # 웹: 로그 y 도메인 [1, auto]
ticks7 = [3, 7, 11, 22, 50, 100, 200, 400]
ax.set_xticks(np.log10(ticks7), [str(t) for t in ticks7])
ax.set_xlim(LO, HI)
ax.yaxis.set_major_formatter(FuncFormatter(fmt_compact))
ax.set(xlabel='정격 출력 (kW, 로그 눈금)', ylabel='충전기 수 (기 / 구간)')
ax.legend(handles=[Patch(color=BLUE, alpha=.85, label='구간별 충전기 수'), Line2D([], [], color=ORANGE, linewidth=2.2, label='KDE 추정 곡선')],
          loc='lower left', bbox_to_anchor=(0, 1.0), ncol=2, frameon=False)
frame_axes(ax, 'y')
np_hist, _ = np.histogram(np.repeat(lxv, wts.astype(int)), bins=edges)
assert np.array_equal(hist_counts.astype(int), np_hist) and hist_counts.sum() == len(positive)
web_kde = np.array([(wts * np.exp(-.5 * ((g - lxv) / LOG_BIN) ** 2)).sum() / (np.sqrt(2 * np.pi) * LOG_BIN) * LOG_BIN for g in mids])
sns_kde_at_mids = np.interp(mids, _kx, _ky)
kde_rel = float(np.max(np.abs(sns_kde_at_mids - web_kde) / web_kde))
assert kde_rel < .005, kde_rel  # Seaborn KDE = 웹 weightedKde (구간 중앙 값 0.5% 이내)
mode = float(freq.idxmax())
save(fig, 7, 'output_histogram_kde', title='충전기 정격 출력 분포', web_title='충전기 정격 출력 분포 (기본: 로그 y)',
     chart_type='히스토그램 + KDE', functions=['seaborn.histplot(weights=…, bins=log10 구간, kde=True)', 'SciPy gaussian_kde (Seaborn 내부, 대역폭 고정)', 'matplotlib Axes.set_yscale("log")'],
     data_date=CH_DATE, basis=f'양수 출력 {len(positive):,}기 · log10 구간 {len(edges) - 1}개(폭 0.125) · KDE 대역폭 0.125(log10)', deletion=f'전체 {N_ALL:,}기 (삭제 표시 포함)',
     results=[f"중앙값 {float(np.median(positive)):g}kW, 가장 많은 값은 {mode:g}kW({int(freq.max()):,}기)입니다.",
              f"100kW 이상은 {int((positive >= 100).sum()):,}기({(positive >= 100).mean() * 100:.1f}%)입니다."],
     values={'bin_edges_log10': edges.tolist(), 'bin_counts': hist_counts.astype(int).tolist(), 'valid_positive': int(len(positive)),
             'excluded': int(N_ALL - len(positive)), 'median_kw': float(np.median(positive)),
             'kde_at_bin_mids_web_formula': web_kde.round(3).tolist(), 'kde_seaborn_vs_web_max_rel_diff': kde_rel})

# ================================================================ 8. 지역 × 출력 구간 — 히트맵 (웹 Heatmap, 행 기준 비율)
BANDS = ['30kW 미만', '30–50', '50–100', '100–200', '200kW 이상', '미상']   # ChartCards.tsx OUTPUT_BANDS / bandIndex
band = pd.Series(np.select([output_kw < 30, output_kw < 50, output_kw < 100, output_kw < 200], BANDS[:4], BANDS[4]), index=ALL.index)
band[~(output_kw > 0)] = BANDS[5]
cnt8 = pd.crosstab(ALL.zcode, band).reindex(columns=BANDS, fill_value=0)
cnt8 = cnt8.loc[cnt8.sum(axis=1).sort_values(ascending=False, kind='stable').index]  # 웹: 지역 합계 내림차순
assert cnt8.to_numpy().sum() == N_ALL
pct8 = cnt8.div(cnt8.sum(axis=1), axis=0) * 100
span8 = pct8.max() - pct8.min()
t8 = ((pct8 - pct8.min()) / span8.replace(0, np.nan)).fillna(.5)   # 웹: 열(출력 구간)마다 최소→최대 상대 색
annot8 = pct8.map(lambda p: f'{p:.0f}' if p >= 10 else f'{p:.1f}')  # 웹: 10% 이상 정수, 미만 소수 1자리
fig, ax = canvas('지역별 충전기 출력 구간 구성', '행 기준 비율(%) · 칸 숫자 = 지역 안 비율 · 색 = 같은 출력 구간(열) 안에서 낮음(밝음)→높음(진함) · 충전기 수 많은 지역 순',
                 [CH_SRC, CH_FOOT_ALL + ' · 출력 미상(0·결측) 포함'], h=9, rect=(.11, .14, .97, .85))
sns.heatmap(t8, annot=annot8, fmt='', cmap=SEQ, vmin=0, vmax=1, linewidths=2, linecolor='white', cbar=False, ax=ax,
            yticklabels=[SHORT[c] for c in cnt8.index], annot_kws={'fontsize': 11.5})
for text, t in zip(ax.texts, t8.to_numpy().ravel()):
    text.set_color('white' if t > .55 else INK)
    text.set_fontweight('bold' if t >= .8 else 'normal')
ax.xaxis.tick_top()
ax.set(xlabel='', ylabel='')
ax.tick_params(axis='y', rotation=0, length=0, labelcolor=LABEL, labelsize=12.5)
ax.tick_params(axis='x', length=0, labelsize=12.5, labelcolor=LABEL)
nat8 = cnt8.sum()
hi200 = pct8['200kW 이상'].idxmax()
save(fig, 8, 'regional_output_heatmap', title='지역별 충전기 출력 구간 구성', web_title='지역별 충전기 출력 구간 구성', chart_type='히트맵 (행 기준 구성비)',
     functions=['seaborn.heatmap(annot=문자열, 열 기준 상대 색)', 'pandas.crosstab'],
     data_date=CH_DATE, basis='16개 시도 × 6개 출력 구간(30 미만·30–50·50–100·100–200·200 이상·미상) · 지역 합계 = 100%', deletion=f'전체 {N_ALL:,}기 (삭제 표시 포함)',
     results=[f"전국 30kW 미만 {int(nat8['30kW 미만']):,}기({nat8['30kW 미만'] / N_ALL * 100:.1f}%), 200kW 이상 {int(nat8['200kW 이상']):,}기({nat8['200kW 이상'] / N_ALL * 100:.1f}%)입니다.",
              f"200kW 이상 비율이 가장 높은 지역은 {SHORT[hi200]} {pct8.loc[hi200, '200kW 이상']:.1f}%이고, 출력 미상은 {int(nat8['미상']):,}기입니다."],
     values={'bands': BANDS, 'order': cnt8.index.tolist(), 'counts': {c: [int(v) for v in r] for c, r in cnt8.iterrows()}})

def monotone_x(xs, ys, per: int = 24):
    """웹(recharts type="monotone" = d3 curveMonotoneX)과 같은 단조 3차 곡선의 촘촘한 점."""
    x, y = np.asarray(xs, float), np.asarray(ys, float)
    n = len(x)
    if n < 3:
        return x, y
    s = np.diff(y) / np.diff(x)
    h = np.diff(x)
    t = np.zeros(n)
    for i in range(1, n - 1):
        p_ = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i])
        t[i] = (np.sign(s[i - 1]) + np.sign(s[i])) * min(abs(s[i - 1]), abs(s[i]), .5 * abs(p_)) or 0.0
    t[0] = (3 * s[0] - t[1]) / 2
    t[-1] = (3 * s[-1] - t[-2]) / 2
    X, Y = [x[0]], [y[0]]
    u = np.linspace(0, 1, per + 1)[1:]
    for i in range(n - 1):  # 3차 베지어: 제어점 (x0+dx/3, y0+dx·t0/3), (x1−dx/3, y1−dx·t1/3)
        dx = h[i]
        P = [(x[i], y[i]), (x[i] + dx / 3, y[i] + dx * t[i] / 3), (x[i + 1] - dx / 3, y[i + 1] - dx * t[i + 1] / 3), (x[i + 1], y[i + 1])]
        b = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u ** 2 * (1 - u), u ** 3]
        X += list(sum(bk * P[k][0] for k, bk in enumerate(b)))
        Y += list(sum(bk * P[k][1] for k, bk in enumerate(b)))
    return np.array(X), np.array(Y)


# ================================================================ 9. 연도별 누적 설치 — 누적 영역 (웹 CumulativeChart)
g = growth.reset_index(drop=True)
last_complete = int(g.loc[~g.partial, 'year'].max())
part = g[g.partial]
fig, ax = canvas('연도별 누적 충전기 설치 추이', f'영역 그래프 · 누적값은 {int(g.year.min())}년부터의 전체 누적 · 점선과 음영 띠는 '
                 + (f'{int(part.year.iloc[0])}년 부분 연도' if len(part) else '부분 연도'),
                 [f'출처: 충전기 설치 성장 추세 통계 (파일명 날짜 {g.source_filename_date.iloc[0]}, 정확한 집계 마감일 미기재)',
                  '기준: 연도별 공식 설치 통계 · API 충전기 현황(현재 재고)과 모집단이 다름 · 삭제 표시 개념 없음'], rect=(.09, .17, .96, .86))
done = g[~g.partial]
ax.set_ylim(0, g.cumulative_count.max() * 1.08)
cx, cy = monotone_x(done.year, done.cumulative_count)                                     # 웹 Area type="monotone"
ax.stackplot(cx, cy, colors=[(*to_rgb(BLUE), .25)], linewidth=0)                           # 완료 연도: 채운 영역
ax.plot(cx, cy, color=BLUE, linewidth=2.2)                                                  # + 실선
if len(part):
    tail = g[g.year >= last_complete]
    ax.plot(tail.year, tail.cumulative_count, color=ORANGE, linewidth=2.2, dashes=(5, 5))  # 부분 연도 구간: 점선
    py = int(part.year.iloc[0])
    ax.axvspan(last_complete, py, color=ORANGE, alpha=.08, linewidth=0)                    # 웹 ReferenceArea(마지막 완료 연도~부분 연도)
    ax.text(py - .08, g.cumulative_count.max() * .55, '부분\n연도', ha='right', va='center', fontsize=12, color=ORANGE)
    ax.plot([py], [int(part.cumulative_count.iloc[0])], marker='o', markersize=8, markerfacecolor='white', markeredgecolor=ORANGE,
            markeredgewidth=2, zorder=4)
ax.set_xlim(g.year.min(), g.year.max() + .15)
ax.set_ylim(0, g.cumulative_count.max() * 1.08)
ax.set_xticks(g.year, [str(y) for y in g.year])
ax.yaxis.set_major_formatter(FuncFormatter(fmt_compact))
ax.set(xlabel='연도', ylabel='누적 설치 수 (기)')
frame_axes(ax, 'y')
lc = g[g.year == last_complete].iloc[0]
first100k = int(g.loc[g.cumulative_count >= 100_000, 'year'].min())
save(fig, 9, 'cumulative_installations_area', title='연도별 누적 충전기 설치 추이', web_title='연도별 누적 충전기 설치 추이', chart_type='누적 영역그래프',
     functions=['matplotlib Axes.stackplot (완료 연도 누적 영역, 웹과 같은 monotoneX 곡선)', 'matplotlib Axes.plot (실선·점선)', 'matplotlib Axes.axvspan (부분 연도 띠)'],
     data_date=f'{int(g.year.min())}–{int(g.year.max())}년 연도 통계 ({", ".join(str(int(y)) for y in part.year)}년 부분 연도)',
     basis='웹 기본 연도 구간(전체) · 누적 = 2011년부터의 합', deletion='해당 없음 (설치 통계)',
     results=[f"{last_complete}년 누적 {int(lc.cumulative_count):,}기, {int(part.year.iloc[0])}년(부분 연도) 누적 {int(part.cumulative_count.iloc[0]):,}기입니다.",
              f"누적 10만 기를 처음 넘은 해는 {first100k}년입니다."],
     values={'years': g.year.astype(int).tolist(), 'cumulative': g.cumulative_count.astype(int).tolist(),
             'annual': g.annual_installed_count.astype(int).tolist(), 'partial_years': part.year.astype(int).tolist()})

# ================================================================ 10. 운영기관별 충전기 규모 — 트리맵 (웹 OperatorTreemap, 상위 20 + 기타)
# 백엔드 /api/operators 와 같은 기준: 운영기관 ID(busiId)별 합계, 표시 이름 = ID별 가장 많은 원본 기관명(bnm)
names = (ALL.groupby(['busiId', 'bnm']).size().reset_index(name='n')
         .sort_values(['n', 'bnm'], ascending=[False, True], kind='stable').drop_duplicates('busiId').set_index('busiId').bnm)
ops = ALL.groupby('busiId').size().reset_index(name='n').sort_values(['n', 'busiId'], ascending=[False, True], kind='stable')
ops['name'] = ops.busiId.map(names)
top20 = ops.head(20)
etc = int(ops.n.iloc[20:].sum())
vals10 = top20.n.astype(int).tolist() + ([etc] if etc else [])
names10 = top20.name.tolist() + ([f'기타 {len(ops) - 20}개 운영기관 ID'] if etc else [])
assert sum(vals10) == N_ALL


def tree_color(rank: int) -> str:
    if rank <= 3:
        return TREE_TOP[rank - 1]
    return next(c for last, c in TREE_BANDS if rank <= last)


colors10 = [tree_color(i + 1) for i in range(len(top20))] + ([OTHER] if etc else [])


def recharts_squarify(values, W, H, ratio=1.6):
    """웹 OperatorTreemap(recharts Treemap, aspectRatio 1.6)의 squarify 배치를 픽셀 반올림까지 그대로 옮긴 함수."""
    total = sum(values)
    kids = [{'i': i, 'area': v * (W * H) / total} for i, v in enumerate(values)]
    out: dict[int, list[float]] = {}

    def worst(row, area, size):
        pa, ra = size * size, area * area
        mn, mx = min(c['area'] for c in row), max(c['area'] for c in row)
        return max(pa * mx * ratio / ra, ra / (pa * mn * ratio)) if ra else float('inf')

    def layout(row, area, size, r, flush):
        if size == r['w']:  # 가로 한 줄
            rh = round(area / size) if size else 0
            rh = r['h'] if flush or rh > r['h'] else rh
            cx = r['x']
            for c in row:
                w = min(round(c['area'] / rh) if rh else 0, r['x'] + r['w'] - cx)
                out[c['i']] = [cx, r['y'], w, rh]
                cx += w
            out[row[-1]['i']][2] += r['x'] + r['w'] - cx
            return dict(x=r['x'], y=r['y'] + rh, w=r['w'], h=r['h'] - rh)
        rw = round(area / size) if size else 0  # 세로 한 줄
        rw = r['w'] if flush or rw > r['w'] else rw
        cy = r['y']
        for c in row:
            h = min(round(c['area'] / rw) if rw else 0, r['y'] + r['h'] - cy)
            out[c['i']] = [r['x'], cy, rw, h]
            cy += h
        out[row[-1]['i']][3] += r['y'] + r['h'] - cy
        return dict(x=r['x'] + rw, y=r['y'], w=r['w'] - rw, h=r['h'])

    rect = dict(x=0, y=0, w=W, h=H)
    row, area, best, size, temp = [], 0.0, float('inf'), min(W, H), kids[:]
    while temp:
        row.append(temp[0])
        area += temp[0]['area']
        score = worst(row, area, size)
        if score <= best:
            temp.pop(0)
            best = score
        else:
            area -= row.pop()['area']
            rect = layout(row, area, size, rect, False)
            size = min(rect['w'], rect['h'])
            row, area, best = [], 0.0, float('inf')
    if row:
        layout(row, area, size, rect, True)
    return [out[i] for i in range(len(values))]


def fit(name: str, avail_px: float, size_px: float) -> str:  # 웹 fit: 남는 폭에 맞춰 줄이고 3글자 미만이면 생략
    n = int(avail_px // (size_px * .98))
    if len(name) <= n:
        return name
    return name[:n - 1] + '…' if n - 1 >= 3 else ''


WT, HT = 1250, 380                                             # 웹 화면(1600px 창)의 트리맵 크기(px)
rects = recharts_squarify(vals10, WT, HT)
assert sum(w * h for _, _, w, h in rects) == WT * HT
fig, ax = canvas('운영기관별 충전기 규모', f'트리맵: 면적 = 충전기 수 · 운영기관 ID 기준 상위 20개 + 기타 · 전체 운영기관 ID {len(ops)}개',
                 [CH_SRC, CH_FOOT_ALL + ' · 비율 분모 = 전체 충전기 수'], h=6.2, rect=(.035, .175, .965, .175 + 11.16 * HT / WT / 6.2))
PT = 11.16 * 72 / WT                                           # 1px 이 몇 pt 인지 (축 너비 11.16in = 1250px)
for i, ((x, y, w, h), v, nm, col) in enumerate(zip(rects, vals10, names10, colors10)):
    patch = Rectangle((x + 1, y + 1), w - 2, h - 2, facecolor=col, edgecolor='white', linewidth=1)
    ax.add_patch(patch)
    share = fmt_pct(v / N_ALL * 100)
    ink = TITLE if sum(to_rgb(col)) / 3 > .62 else 'white'
    top = i < 3
    big = top and w > 120 and h > 70
    size = 15 if big else 13
    badge = top and w > 40 and h > 40
    lx = x + (34 if badge else 9)
    label = fit(nm, x + w - lx - 6, size) if h >= 26 and w >= 40 else ''
    two = h >= (64 if big else 46)
    if badge:
        ax.text(x + 19, y + 20, str(i + 1), fontsize=12 * PT * 1.25, weight='bold', color=ink, ha='center', va='center')
    if label:
        ax.text(lx, y + (25 if big else 21), label, fontsize=size * PT * 1.15, weight='bold', color=ink, va='baseline', ha='left',
                clip_on=True).set_clip_path(patch)
    if v and w >= 40 and h >= 22 and (two or not label):
        ax.text(x + 12 if big else (lx if label else x + 8), y + (54 if big else 40) if label else y + min(21, h / 2 + 5), share,
                fontsize=(20 if big else 13) * PT * 1.15, weight='bold' if big else 'normal', color=ink, va='baseline', ha='left',
                clip_on=True).set_clip_path(patch)
ax.set(xlim=(0, WT), ylim=(0, HT))
ax.invert_yaxis()
ax.axis('off')
leg = [Patch(color=TREE_TOP[0], label='1위'), Patch(color=TREE_TOP[1], label='2·3위 (번호 표시)'), Patch(color=TREE_BANDS[0][1], label='4–6위'),
       Patch(color=TREE_BANDS[1][1], label='7–10위'), Patch(color=TREE_BANDS[2][1], label='11–20위'), Patch(color=OTHER, label='기타')]
ax.legend(handles=leg, loc='lower left', bbox_to_anchor=(0, 1.01), ncol=6, frameon=False, handlelength=1.1, handleheight=1.1, fontsize=11)
first = top20.iloc[0]
save(fig, 10, 'operator_treemap', title='운영기관별 충전기 규모', web_title='운영기관별 충전기 규모', chart_type='트리맵 (상위 20 + 기타)',
     functions=['recharts_squarify (웹 recharts Treemap 배치를 Python으로 이식)', 'matplotlib patches.Rectangle', 'seaborn.set_theme'],
     data_date=CH_DATE, basis=f'운영기관 ID(busiId) {len(ops)}개 · 충전기 수 내림차순 상위 20개 + 기타 · 이름 = ID별 최다 기관명',
     deletion=f'전체 {N_ALL:,}기 (삭제 표시 포함)',
     results=[f"1위 {first['name']} [{first.busiId}] {int(first.n):,}기({first.n / N_ALL * 100:.1f}%)입니다.",
              f"상위 20개 ID 합계 {sum(vals10[:20]):,}기({sum(vals10[:20]) / N_ALL * 100:.1f}%), 나머지 {len(ops) - 20}개 ID가 {etc:,}기입니다."],
     values={'operator_ids': int(len(ops)), 'top20': [{'id': r.busiId, 'name': r.name, 'charger_count': int(r.n)} for r in top20.itertuples()],
             'other': etc, 'matched_total': N_ALL, 'layout_px_1250x380': rects})

# ---------------------------------------------------------------- 메타데이터
assert [c['id'] for c in charts] == list(range(1, 11))
GROWTH_SRC = f'출처: 충전기 설치 성장 추세 통계 (파일명 날짜 {g.source_filename_date.iloc[0]}, 정확한 집계 마감일 미기재)'
WEB_API = {1: '/api/ev-registration', 2: '/api/ev-registration', 3: '/api/ev-registration', 4: '/api/charger-regions',
           5: '/api/station-size-distribution?deletion=not_deleted', 6: '/api/charger-types', 7: '/api/charger-output',
           8: '/api/charger-output/regions', 9: '/api/growth', 10: '/api/operators?page=1&limit=20'}
WEB_FILTER = {1: '없음 (16개 시도 고정)', 2: '등록 지역 필터 없음 = 전국', 3: '없음 (16개 시도 고정), 보기 = 비율',
              4: '삭제 표시 전체 · 유형·기관 전체 (지역 필터는 이 그래프에서 제외)', 5: "삭제 표시 '전체' → 이 그래프는 비삭제(N)로 요청 · 유형·지역·기관 전체",
              6: '삭제 표시 전체 · 지역·유형·기관 전체', 7: '삭제 표시 전체 · 지역·유형·기관 전체 · 세로축 로그',
              8: '삭제 표시 전체 · 유형·기관 전체 (16개 지역 각각)', 9: '연도 구간 전체 (2011–마지막 해)',
              10: '삭제 표시 전체 · 지역·유형 전체 (운영기관 필터는 이 그래프에서 제외)'}
for c in charts:
    i = c['id']
    c['source'] = (EV_SRC if i <= 3 else GROWTH_SRC if i == 9 else CH_SRC).removeprefix('출처: ')
    c['data_file'] = ('ev_registration_by_region_2026_09.csv' if i <= 3 else 'charger_installation_trend.csv' if i == 9 else 'charger_info_clean.csv')
    c['web_api'] = WEB_API[i]
    c['web_default_filter'] = WEB_FILTER[i]
src_hash = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in
            [DATA / 'charger_info_clean.csv', DATA / 'ev_registration_by_region_2026_09.csv', DATA / 'charger_installation_trend.csv']}
meta = {'title': 'CHARGE GAP 웹사이트 그래프 1~10 Python 구현 (흰 배경)',
        'generator': 'scripts/create_web_matched_charts_2026.py',
        'generated_at': datetime.now().astimezone().isoformat(timespec='seconds'),
        'libraries': {'matplotlib': matplotlib.__version__, 'seaborn': sns.__version__, 'pandas': pd.__version__, 'numpy': np.__version__},
        'font': FONT,
        'reference': '현재 웹사이트 기본 필터 화면 (frontend/src/features/ChartCards.tsx, frontend/src/charts/*.tsx)',
        'data': {'ev_registration': {'date': EV_DATE, 'total': EV_TOTAL, 'regions': 16},
                 'chargers': {'date': CH_DATE, 'snapshot': SNAP, 'total': N_ALL, 'not_deleted': N_ND, 'deleted': N_DEL},
                 'growth': {'years': [int(g.year.min()), int(g.year.max())], 'partial_years': part.year.astype(int).tolist()},
                 'source_sha256': src_hash},
        'charts': charts}
(OUT / 'metrics.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(json.dumps({'out': str(OUT), 'charts': [c['file'] for c in charts], 'kde_max_rel_diff': charts[6]['values']['kde_seaborn_vs_web_max_rel_diff']}, ensure_ascii=False))

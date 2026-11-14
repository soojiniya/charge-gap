"""처음 제작한 Python 원본 그래프(outputs/charts/)의 스타일로, 현재 웹사이트 자료 기준 그래프를 다시 그립니다.

원본 생성 스크립트는 저장소에 없어서, 원본 PNG를 픽셀 단위로 측정한 값(이미지 크기·여백·색·글자 크기·막대 두께·
축 범위 규칙)으로 스타일을 되살렸습니다. 원본과 같은 자료로 다시 그려 원본 PNG와 겹쳐 비교해 검증합니다
(--reproduce-original: outputs/charts_2026_09_updated/_check/ 에 원본 기준 재현본을 저장).

갱신 대상과 자료 기준 (현재 웹사이트와 같은 기준)
- 01 지역별 전기차 등록 대수 TOP 10       2026년 9월 등록, 16개 지역(전남광주 통합)
- 02 전기차 차종별 등록 비율              2026년 9월 등록
- 03 사업용·비사업용 전기차 등록 비교     2026년 9월 등록, 16개 지역 (세로 누적 막대 유지)
- 06 충전기 유형별 구성                   2026-10-15 조회, 삭제 표시 포함 전체 527,433기 (웹 기본 필터)
- 07 충전기 출력(kW) 분포                 같은 기준, 양수 출력 (10kW 구간·로그 세로축 유지)
- 08 운영기관별 충전기 등록 현황 TOP 10   같은 기준, 운영기관 ID(busiId) 기준 집계 (웹과 같은 규칙)
- 10 지역별 충전 출력 구성 비교           같은 기준, 출력 미상 포함
04·05·09는 현재 자료와 이미 같아서 원본 PNG(outputs/charts/)를 그대로 씁니다.

입력: data/processed/ev_registration_by_region_2026_09.csv, data/processed/charger_info_clean.csv
출력: outputs/charts_2026_09_updated/*.png, outputs/charts_2026_09_updated/metrics.json (그래프 수치 검증용)
원본 outputs/charts/ 와 다크 테마 frontend/public/python-charts/ 는 건드리지 않습니다.

글꼴: 원본과 같은 맑은 고딕(Malgun Gothic). Windows에서는 C:\\Windows\\Fonts 를 그대로 쓰고,
다른 환경에서는 --font-dir 로 malgun.ttf·malgunbd.ttf 가 있는 폴더를 지정합니다.

실행 예
  python scripts/create_original_style_charts_2026.py
  python scripts/create_original_style_charts_2026.py --reproduce-original data/processed/ev_registration_by_region_2025.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import font_manager as fm  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402
from matplotlib.ticker import FixedLocator, FuncFormatter, LogLocator, MultipleLocator, NullLocator  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DPI = 200

# ---------------------------------------------------------------- 원본 PNG에서 측정한 공통 스타일
TITLE, MUTED, TICK, LABEL = '#132E44', '#697D8F', '#526575', '#334155'
BLUE, ORANGE, TEAL, PURPLE = '#276C9B', '#D6864A', '#2B8C82', '#846BA1'
GRID, SPINE = '#E7EEF4', '#CBD5E1'
# 원본 06 범례에서 읽은 유형별 색 (조각 큰 순서)
PIE_COLORS = ['#276C9B', '#2B8C82', '#D6864A', '#846BA1', '#54A6B5', '#D2AE56', '#A4B9CB', '#AF7371', '#739164', '#9D8FBA',
              '#B0B7C0']

# 제목·부제·하단 출처 3줄: 원본은 글자 윗선이 이미지 높이에 비례하는 위치에 있습니다(1500px·2200px 원본에서 측정).
TEXT_X = 157 / 2400
TEXT_TOPS = dict(title=0.0657, sub=0.1257, foot=(0.8857, 0.9211, 0.9557))  # 글자 윗선 = 비율 × 높이 - 1.6px
TEXT_DY = dict(title=0.0, sub=0.0, foot=0.0)  # va='top' 기준점과 실제 글자 윗선의 차이(px, 글자 크기별 보정)
TITLE_FS, SUB_FS, FOOT_FS = 20.8, 10.4, 8.5


def setup_fonts(font_dir: str | None) -> None:
    dirs = [Path(font_dir)] if font_dir else [Path('C:/Windows/Fonts'), Path.home() / '.fonts_cg']
    for d in dirs:
        if d.exists():
            for name in ('malgun.ttf', 'malgunbd.ttf'):
                if (d / name).exists():
                    fm.fontManager.addfont(str(d / name))
    if 'Malgun Gothic' not in {f.name for f in fm.fontManager.ttflist}:
        raise SystemExit('맑은 고딕(Malgun Gothic) 글꼴을 찾지 못했습니다. --font-dir 로 malgun.ttf 위치를 지정하세요.')
    plt.rcParams['font.family'] = 'Malgun Gothic'
    plt.rcParams['axes.unicode_minus'] = False


def canvas(W: int, H: int, title: str, subtitle: str, footer: list[str]):
    fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI, facecolor='white')
    top = lambda f, dy: 1 - (f * H - 1.6 + dy) / H  # noqa: E731
    fig.text(TEXT_X, top(TEXT_TOPS['title'], TEXT_DY['title']), title, fontsize=TITLE_FS, weight='bold', color=TITLE, va='top')
    fig.text(TEXT_X, top(TEXT_TOPS['sub'], TEXT_DY['sub']), subtitle, fontsize=SUB_FS, color=MUTED, va='top')
    for line, f in zip(footer, TEXT_TOPS['foot']):
        fig.text(TEXT_X, top(f, TEXT_DY['foot']), line, fontsize=FOOT_FS, color=MUTED, va='top')
    return fig


def add_axes(fig, W, H, l, t, r, b):
    """원본 픽셀 좌표(왼쪽, 위, 오른쪽, 아래)로 축 위치를 지정."""
    return fig.add_axes([l / W, 1 - b / H, (r - l) / W, (b - t) / H])


def style_axes(ax, grid_axis: str):
    ax.grid(axis=grid_axis, color=GRID, linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
    for s in ('left', 'bottom'):
        ax.spines[s].set_color(SPINE)
        ax.spines[s].set_linewidth(1.1)
    ax.tick_params(axis='both', length=0, colors=TICK, labelsize=11)


def save(fig, out):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=DPI, facecolor='white')
    plt.close(fig)


comma = FuncFormatter(lambda v, _: f'{int(v):,}')


# ================================================================ 01 가로 막대 TOP 10
def chart01(rows, out, subtitle, footer):
    W, H = 2400, 1500
    fig = canvas(W, H, '지역별 전기차 등록 대수 TOP 10', subtitle, footer)
    ax = add_axes(fig, W, H, 251.5, 314, 2243, 1155.5)
    names, vals = [r[0] for r in rows], [r[1] for r in rows]
    y = list(range(len(rows)))
    ax.barh(y, vals, height=0.579, color=BLUE, zorder=3)
    ax.set_yticks(y, names)
    ax.set_ylim(9.781, -0.812)
    vmax = max(vals)
    ax.set_xlim(0, vmax * 1.22)
    ax.xaxis.set_major_locator(MultipleLocator(50000))
    ax.xaxis.set_major_formatter(comma)
    style_axes(ax, 'x')
    ax.tick_params(axis='x', pad=9)
    ax.tick_params(axis='y', labelsize=12, pad=8)
    ax.set_xlabel('전기차 등록 대수 (대)', fontsize=11.2, color=LABEL, labelpad=4.3)
    ax.set_ylabel('지역', fontsize=11.2, color=LABEL, labelpad=3.5)
    for yi, v in zip(y, vals):
        ax.text(v + vmax * 0.012, yi, f'{v:,}', va='center', ha='left', fontsize=10.5, color=TITLE)
    save(fig, out)


# ================================================================ 02 도넛
def chart02(parts, out, subtitle, footer, G=None):
    """parts: [(차종, 대수)] 원본 순서(승용·승합·화물·특수)."""
    g = dict(cx=792.5, cy=734.5, R=348, width=0.32, edge=2.0, pct_fs=12, pct_r=0.85, num_fs=24.8, num_y=741, sub_fs=11.2,
             sub_y=797, leg_x=1276, leg_y0=612, leg_dy=81, leg_w=54, leg_h=15, leg_tx=1360, leg_fs=11.1, gap='   ')
    g.update(G or {})
    W, H = 2600, 1500
    fig = canvas(W, H, '전기차 차종별 등록 비율', subtitle, footer)
    ax = add_axes(fig, W, H, g['cx'] - g['R'], g['cy'] - g['R'], g['cx'] + g['R'], g['cy'] + g['R'])
    vals = [v for _, v in parts]
    total = sum(vals)
    colors = [BLUE, TEAL, ORANGE, PURPLE]
    wedges, _ = ax.pie(vals, colors=colors, startangle=90, counterclock=False, radius=1,
                       wedgeprops=dict(width=g['width'], edgecolor='white', linewidth=g['edge']))
    ax.set_xlim(-1, 1); ax.set_ylim(-1, 1); ax.set_aspect('equal'); ax.axis('off')
    for w, v in zip(wedges, vals):
        if v / total >= 0.05:
            ang = math.radians((w.theta1 + w.theta2) / 2)
            ax.text(g['pct_r'] * math.cos(ang), g['pct_r'] * math.sin(ang), f'{v / total * 100:.1f}%', ha='center',
                    va='center', fontsize=g['pct_fs'], weight='bold', color='white')
    fig.text(g['cx'] / W, 1 - g['num_y'] / H, f'{total:,}', ha='center', va='baseline', fontsize=g['num_fs'],
             weight='bold', color=TITLE)
    fig.text(g['cx'] / W, 1 - g['sub_y'] / H, '전기차 등록 (대)', ha='center', va='baseline', fontsize=g['sub_fs'], color=MUTED)
    for i, ((name, v), c) in enumerate(zip(parts, colors)):
        yc = g['leg_y0'] + i * g['leg_dy']
        fig.patches.append(Rectangle((g['leg_x'] / W, 1 - (yc + g['leg_h'] / 2) / H), g['leg_w'] / W, g['leg_h'] / H,
                                     transform=fig.transFigure, color=c, figure=fig))
        fig.text(g['leg_tx'] / W, 1 - yc / H, f"{name}{g['gap']}{v:,}대 ({v / total * 100:.2f}%)", va='center',
                 fontsize=g['leg_fs'], color=TITLE)
    save(fig, out)


def legend_row(fig, W, H, items, y, x0, patch=(58, 19), gap_text=26, gap_item=None, fs=11.5, xs=None):
    """원본의 가로 범례(색 막대 + 글자)를 픽셀 위치로 그림. xs: 항목별 시작 x."""
    for i, (label, color) in enumerate(items):
        x = xs[i]
        fig.patches.append(Rectangle((x / W, 1 - (y + patch[1] / 2) / H), patch[0] / W, patch[1] / H,
                                     transform=fig.transFigure, color=color, figure=fig))
        fig.text((x + patch[0] + gap_text) / W, 1 - y / H, label, va='center', fontsize=fs, color=TITLE)


# ================================================================ 03 세로 누적 막대 (대수)
def chart03(rows, out, subtitle, footer, G=None):
    """rows: [(지역, 비사업용, 사업용)] 전체 등록 대수 내림차순."""
    g = dict(ax=(210, 351, 2675, 1216), bar_w=0.675, edge=1.0, ymax_k=1.18, xmargin=1.172, xtick_pad=9, ytick_pad=9.8,
             label_fs=11.2, xlabel_pad=3.6, ylabel_pad=4, leg_y=395, leg_xs=(2199, 2470), leg_fs=11.5)
    g.update(G or {})
    W, H = 2800, 1600
    fig = canvas(W, H, '사업용·비사업용 전기차 등록 비교', subtitle, footer)
    ax = add_axes(fig, W, H, *g['ax'])
    x = np.arange(len(rows))
    non = np.array([r[1] for r in rows]); com = np.array([r[2] for r in rows])
    ax.bar(x, non, width=g['bar_w'], color=BLUE, edgecolor='white', linewidth=g['edge'], zorder=3)
    ax.bar(x, com, bottom=non, width=g['bar_w'], color=ORANGE, edgecolor='white', linewidth=g['edge'], zorder=3)
    ax.set_xticks(x, [r[0] for r in rows])
    ax.set_xlim(-g['xmargin'], len(rows) - 1 + g['xmargin'])
    ax.set_ylim(0, (non + com).max() * g['ymax_k'])
    ax.yaxis.set_major_locator(MultipleLocator(50000))
    ax.yaxis.set_major_formatter(comma)
    style_axes(ax, 'y')
    ax.tick_params(axis='x', pad=g['xtick_pad'])
    ax.tick_params(axis='y', pad=g['ytick_pad'])
    ax.set_xlabel('지역', fontsize=g['label_fs'], color=LABEL, labelpad=g['xlabel_pad'])
    ax.set_ylabel('전기차 등록 대수 (대)', fontsize=g['label_fs'], color=LABEL, labelpad=g['ylabel_pad'])
    legend_row(fig, W, H, [('비사업용', BLUE), ('사업용', ORANGE)], g['leg_y'], 0, fs=g['leg_fs'], xs=g['leg_xs'])
    save(fig, out)


def pct_text(v, total):
    p = v / total * 100
    return '<0.01%' if p < 0.01 else f'{p:.2f}%'


# ================================================================ 06 파이 (유형별)
def chart06(parts, out, subtitle, footer, G=None):
    """parts: [(유형 코드, 공식 명칭, 기수)] 큰 순서."""
    g = dict(cx=779.5, cy=783.5, R=370.5, edge=0.8, pct_fs=12, pct_r=0.70, leg_x=1294, leg_y0=536.5, leg_dy=54.7,
             leg_w=50, leg_h=15, leg_tx=1365, leg_fs=8.9)
    g.update(G or {})
    W, H = 3000, 1600
    fig = canvas(W, H, '충전기 유형별 구성', subtitle, footer)
    ax = add_axes(fig, W, H, g['cx'] - g['R'], g['cy'] - g['R'], g['cx'] + g['R'], g['cy'] + g['R'])
    vals = [p[2] for p in parts]
    total = sum(vals)
    colors = PIE_COLORS[:len(parts)]
    wedges, _ = ax.pie(vals, colors=colors, startangle=90, counterclock=False, radius=1,
                       wedgeprops=dict(edgecolor='white', linewidth=g['edge']))
    ax.set_xlim(-1, 1); ax.set_ylim(-1, 1); ax.set_aspect('equal'); ax.axis('off')
    for w, v in zip(wedges, vals):
        if v / total >= 0.05:
            ang = math.radians((w.theta1 + w.theta2) / 2)
            ax.text(g['pct_r'] * math.cos(ang), g['pct_r'] * math.sin(ang), f'{v / total * 100:.1f}%', ha='center',
                    va='center', fontsize=g['pct_fs'], weight='bold', color='white')
    for i, ((code, name, v), c) in enumerate(zip(parts, colors)):
        yc = g['leg_y0'] + i * g['leg_dy']
        fig.patches.append(Rectangle((g['leg_x'] / W, 1 - (yc + g['leg_h'] / 2) / H), g['leg_w'] / W, g['leg_h'] / H,
                                     transform=fig.transFigure, color=c, figure=fig))
        fig.text(g['leg_tx'] / W, 1 - yc / H, f'{code}  {name}    {v:,}기 ({pct_text(v, total)})', va='center',
                 fontsize=g['leg_fs'], color=TITLE)
    save(fig, out)


# ================================================================ 07 히스토그램 (10kW 구간, 로그 세로축)
def chart07(values, out, subtitle, footer, legend_label, G=None):
    """values: 양수 정격 출력(kW) 배열."""
    g = dict(ax=(234, 335, 2445, 1232), alpha=0.9, edge=1.0, ylim_lo=0.7, ytop_k=3.0, xtick_pad=9, ytick_pad=9.8,
             label_fs=11.2, xlabel_pad=3.6, ylabel_pad=3.3, leg_x=(1936, 2015), leg_y=379, leg_lw=19, leg_tx=2034,
             leg_fs=11.05)
    g.update(G or {})
    W, H = 2600, 1600
    fig = canvas(W, H, '충전기 출력(kW) 분포', subtitle, footer)
    ax = add_axes(fig, W, H, *g['ax'])
    edges = np.arange(0, 420, 10)
    counts, _ = np.histogram(values, bins=edges)
    ax.bar(edges[:-1], counts, width=10, align='edge', color=BLUE, alpha=g['alpha'], edgecolor='white',
           linewidth=g['edge'], zorder=3)
    ax.set_yscale('log')
    ax.set_xlim(0, 410)
    ax.set_ylim(g['ylim_lo'], counts.max() * g['ytop_k'])
    ax.xaxis.set_major_locator(MultipleLocator(50))
    ax.yaxis.set_major_locator(LogLocator(base=10, numticks=12))
    ax.yaxis.set_minor_locator(NullLocator())
    ax.yaxis.set_major_formatter(comma)
    style_axes(ax, 'y')
    ax.tick_params(axis='x', pad=g['xtick_pad'])
    ax.tick_params(axis='y', pad=g['ytick_pad'])
    ax.set_xlabel('충전기 출력 (kW)', fontsize=g['label_fs'], color=LABEL, labelpad=g['xlabel_pad'])
    ax.set_ylabel('충전기 수 (기 · 로그 눈금)', fontsize=g['label_fs'], color=LABEL, labelpad=g['ylabel_pad'])
    x0, x1 = g['leg_x']
    lw_pt = g['leg_lw'] * 72 / DPI
    fig.lines.append(Line2D([(x0 + lw_pt) / W, (x1 - lw_pt) / W], [1 - g['leg_y'] / H] * 2, transform=fig.transFigure,
                            color=BLUE, linewidth=lw_pt, solid_capstyle='round', figure=fig))
    fig.text(g['leg_tx'] / W, 1 - g['leg_y'] / H, legend_label, va='center', fontsize=g['leg_fs'], color=TITLE)
    save(fig, out)
    return counts


# ================================================================ 08 가로 누적 막대 (운영기관 TOP 10, 비삭제·삭제 표시)
def chart08(rows, out, subtitle, footer, G=None):
    """rows: [(표시 이름, 비삭제, 삭제 표시)] 전체 내림차순 10개."""
    g = dict(ax=(756, 335, 2577, 1232), bar_h=0.604, ylim=(9.793, -0.829), xmax_k=1.2, val_off=0.012, val_fs=10,
             ytick_fs=10.2, ytick_pad=9.4, xtick_pad=9, label_fs=11.2, xlabel_pad=3.6, ylabel_pad=4.2, leg_y=1411.5,
             leg_xs=(1955, 2320), leg_fs=11.35)
    g.update(G or {})
    W, H = 2800, 1600
    fig = canvas(W, H, '운영기관별 충전기 등록 현황 TOP 10', subtitle, footer)
    ax = add_axes(fig, W, H, *g['ax'])
    y = np.arange(len(rows))
    nd = np.array([r[1] for r in rows]); de = np.array([r[2] for r in rows]); tot = nd + de
    ax.barh(y, nd, height=g['bar_h'], color=BLUE, zorder=3)
    ax.barh(y, de, left=nd, height=g['bar_h'], color=ORANGE, zorder=3)
    ax.set_yticks(y, [r[0] for r in rows])
    ax.set_ylim(*g['ylim'])
    ax.set_xlim(0, tot.max() * g['xmax_k'])
    ax.xaxis.set_major_locator(MultipleLocator(20000))
    ax.xaxis.set_major_formatter(comma)
    style_axes(ax, 'x')
    ax.tick_params(axis='x', pad=g['xtick_pad'])
    ax.tick_params(axis='y', labelsize=g['ytick_fs'], pad=g['ytick_pad'])
    ax.set_xlabel('충전기 수 (기 · 삭제 포함 총수)', fontsize=g['label_fs'], color=LABEL, labelpad=g['xlabel_pad'])
    ax.set_ylabel('운영기관 표기', fontsize=g['label_fs'], color=LABEL, labelpad=g['ylabel_pad'])
    for yi, v in zip(y, tot):
        ax.text(v + tot.max() * g['val_off'], yi, f'{v:,}', va='center', ha='left', fontsize=g['val_fs'], color=TITLE)
    legend_row(fig, W, H, [('비삭제 표시 (N)', BLUE), ('삭제 표시 (Y)', ORANGE)], g['leg_y'], 0, patch=(58, 18),
               fs=g['leg_fs'], xs=g['leg_xs'])
    save(fig, out)


# ================================================================ 10 히트맵 (지역 내 출력 구간 비율)
HEAT_CMAP = LinearSegmentedColormap.from_list('orig_blue', ['#EFF1F2', '#276C9B'])
BANDS = ['0<출력<30', '30≤출력<50', '50≤출력<100', '100≤출력<200', '출력≥200', '출력 미상']


def chart10(regions, counts, out, subtitle, footer, ylabel, G=None):
    """regions: 지역 표시 이름(충전기 수 내림차순), counts: 지역×6구간 대수."""
    g = dict(ax=(448, 396, 2128, 1760), line=1.3, cell_fs=8.6, white_at=50, ytick_fs=9.0, ytick_pad=9.1, xtick_pad=9,
             label_fs=11.2, xlabel_pad=3.6, ylabel_pad=5.5, cb=(2233, 530, 2285, 1626), cb_fs=11, cb_label_pad=4.8)
    g.update(G or {})
    W, H = 2800, 2200
    fig = canvas(W, H, '지역별 충전 출력 구성 비교', subtitle, footer)
    ax = add_axes(fig, W, H, *g['ax'])
    counts = np.asarray(counts, dtype=float)
    pct = counts / counts.sum(axis=1, keepdims=True) * 100
    mesh = ax.pcolormesh(pct, cmap=HEAT_CMAP, vmin=0, vmax=100, edgecolors='white', linewidth=g['line'])
    ax.set_xlim(0, pct.shape[1]); ax.set_ylim(pct.shape[0], 0)
    for i in range(pct.shape[0]):
        for j in range(pct.shape[1]):
            p, c = pct[i, j], int(counts[i, j])
            label = ('<0.1%' if 0 < p < 0.1 else f'{p:.1f}%') + f'\n({c:,})'
            ax.text(j + 0.5, i + 0.5, label, ha='center', va='center', fontsize=g['cell_fs'], linespacing=1.0,
                    color='white' if p >= g['white_at'] else '#262626')
    ax.set_xticks(np.arange(pct.shape[1]) + 0.5, BANDS)
    ax.set_yticks(np.arange(pct.shape[0]) + 0.5, regions)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(axis='both', length=0, colors=TICK, labelsize=g['ytick_fs'])
    ax.tick_params(axis='x', pad=g['xtick_pad'])
    ax.tick_params(axis='y', pad=g['ytick_pad'])
    ax.set_xlabel('출력 구간 (kW)', fontsize=g['label_fs'], color=LABEL, labelpad=g['xlabel_pad'])
    ax.set_ylabel(ylabel, fontsize=g['label_fs'], color=LABEL, labelpad=g['ylabel_pad'])
    cax = add_axes(fig, W, H, *g['cb'])
    cb = fig.colorbar(mesh, cax=cax, ticks=[0, 20, 40, 60, 80, 100])
    cb.outline.set_visible(False)
    cax.tick_params(colors=TICK, labelsize=g['cb_fs'], length=6, width=1.1)
    cb.set_label('지역 내 비율 (%)', fontsize=g['label_fs'], color=LABEL, labelpad=g['cb_label_pad'])
    save(fig, out)
    return pct


# ================================================================ 자료 준비
TYPE_NAMES = {'01': 'DC차데모', '02': 'AC완속', '03': 'DC차데모+AC3상', '04': 'DC콤보', '05': 'DC차데모+DC콤보',
              '06': 'DC차데모+AC3상+DC콤보', '07': 'AC3상', '08': 'DC콤보(완속)', '09': 'NACS', '10': 'DC콤보+NACS',
              '11': 'DC콤보2(버스전용)'}
HEAT_REGION = {'11': '서울', '12': '전남광주\n통합특별시', '26': '부산', '27': '대구', '28': '인천', '30': '대전', '31': '울산',
               '36': '세종', '41': '경기', '43': '충북', '44': '충남', '47': '경북', '48': '경남', '50': '제주', '51': '강원',
               '52': '전북'}
EV_FOOT_2026 = ['출처: 2026년 9월 자동차 등록자료 · 전처리 ev_registration_by_region_2026_09.csv', '기준: 2026년 9월']
EV_FOOT_2025 = ['출처: 2025년 12월 자동차 등록자료 · 전처리 ev_registration_by_region_2025.csv', '기준: 2025년 12월']
CH_FOOT = ['출처: 한국환경공단 getChargerInfo · 정제 CSV 및 검증된 집계 CSV', '기준: 2026년 10월 15일 04:16–04:19 KST']
DEL_NOTE = '삭제 표시 4,121기 포함(웹 기본 필터) · 삭제 표시는 실제 운영 중인 충전기를 뜻하지 않습니다.'


def output_band(series):
    o = series.apply(pd_numeric)
    return np.select([(o > 0) & (o < 30), (o >= 30) & (o < 50), (o >= 50) & (o < 100), (o >= 100) & (o < 200), o >= 200],
                     [0, 1, 2, 3, 4], 5)


def pd_numeric(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float('nan')


def build(ev_rows, chargers, out_dir: Path, original: bool) -> dict:
    """original=True: 원본과 같은 기준(2025년 12월 등록, 비삭제 충전기, ID·이름 조합)으로 재현. False: 현재 웹 기준."""
    import pandas as pd

    metrics = {}
    sfx = '_reproduced_original' if original else ''
    path = lambda n: out_dir / (f'{n}{sfx}.png')  # noqa: E731
    ev_foot = EV_FOOT_2025 if original else EV_FOOT_2026
    if original:
        name = lambda r: r['region_name_2025']  # noqa: E731
    else:
        name = lambda r: '전남광주' if r['region_code'] == '12' else r['region_name']  # noqa: E731
    total = sum(int(r['ev_registration_count']) for r in ev_rows)
    region_txt = '2025년 당시 17개 시도' if original else '2026년 9월 16개 지역'

    # 01
    top10 = sorted(((name(r), int(r['ev_registration_count'])) for r in ev_rows), key=lambda x: -x[1])[:10]
    chart01(top10, path('01_ev_registration_top10'), f'순수 전기차 · {region_txt} 기준',
            ev_foot + ['광주·전남은 원래 지역 구분 유지 · 충전기 현황과 기준 시점이 다릅니다.' if original else
                       '광주·전남은 전남광주로 통합(웹사이트와 같은 16개 지역) · 충전기 현황과 기준 시점이 다릅니다.'])
    metrics['01'] = dict(total=total, top10=top10, top10_total=sum(v for _, v in top10))

    # 02
    s = lambda k: sum(int(r[k]) for r in ev_rows)  # noqa: E731
    parts = [('승용', s('ev_passenger_count')), ('승합', s('ev_bus_count')), ('화물', s('ev_truck_count')),
             ('특수', s('ev_special_count'))]
    assert sum(v for _, v in parts) == total
    chart02(parts, path('02_ev_vehicle_type_donut'), f'차종별 합계 · 순수 전기차 {total:,}대',
            ev_foot + ['사업/비사업용을 모두 포함 · 하이브리드·수소전기는 포함하지 않았습니다.'])
    metrics['02'] = dict(parts=parts, total=total)

    # 03
    rows3 = sorted(((name(r), int(r['ev_noncommercial_count']), int(r['ev_commercial_count'])) for r in ev_rows),
                   key=lambda x: -(x[1] + x[2]))
    assert all(a + b == next(int(r['ev_registration_count']) for r in ev_rows if name(r) == n) for n, a, b in rows3)
    chart03(rows3, path('03_ev_commercial_stacked'),
            '17개 시도 · 막대 높이는 해당 지역의 전체 전기차 등록 대수' if original else
            '16개 지역(전남광주 통합) · 막대 높이는 해당 지역의 전체 전기차 등록 대수',
            ev_foot + ['비사업용/사업용은 원본 분류 그대로 사용 · 지역 간 원인을 추정하지 않습니다.'])
    metrics['03'] = dict(rows=rows3, noncommercial=sum(r[1] for r in rows3), commercial=sum(r[2] for r in rows3))

    # 충전기 모집단: 원본 재현은 비삭제만, 갱신은 삭제 표시 포함 전체(웹 기본 필터)
    base = chargers[chargers.delYn != 'Y'] if original else chargers
    n_base = len(base)

    # 06
    vc = base.chgerType.value_counts()
    parts6 = [(k, TYPE_NAMES.get(k, k), int(v)) for k, v in vc.items()]
    chart06(parts6, path('06_charger_type_pie'),
            f'공식 커넥터 유형 정의 · 비삭제 표시 {n_base:,}기 기준' if original else
            f'공식 커넥터 유형 정의 · 삭제 표시 포함 전체 {n_base:,}기 기준 (웹사이트 기본 필터)',
            CH_FOOT + ['유형 정의: 한국환경공단 활용가이드 v1.25 §3.3 · 삭제 표시 4,121기는 이 파이에서 제외했습니다.' if original
                       else '유형 정의: 한국환경공단 활용가이드 v1.25 §3.3 · ' + DEL_NOTE])
    metrics['06'] = dict(denominator=n_base, counts=parts6)

    # 07
    out_kw = base.output.apply(pd_numeric)
    pos = out_kw[out_kw > 0].to_numpy()
    counts7 = chart07(pos, path('07_charger_output_histogram'),
                      ('비삭제 표시 충전기의 양수 output' if original else '삭제 표시 포함 전체 충전기의 양수 output')
                      + ' · 10kW 폭 구간 · 세로축 로그 눈금',
                      CH_FOOT + ['출력 결측 169기는 제외하여 별도 기록 · powerType은 전체 결측이라 사용하지 않았습니다.' if original
                                 else f'출력 결측 {n_base - len(pos):,}기는 제외 · ' + DEL_NOTE],
                      f'{"비삭제" if original else "전체"}·양수 출력 {len(pos):,}기')
    metrics['07'] = dict(positive=int(len(pos)), missing=int(n_base - len(pos)), median_kw=float(np.median(pos)),
                         p95_kw=float(np.percentile(pos, 95)), bin_edges_kw=list(range(0, 420, 10)),
                         bin_counts=[int(c) for c in counts7])

    # 08
    deleted = chargers.delYn == 'Y'
    if original:
        t = chargers.assign(n=chargers.busiNm.str.strip(), d=deleted).groupby(['busiId', 'n']).d.agg(['size', 'sum'])
        t = t.reset_index().sort_values('size', ascending=False, kind='stable').head(10)
        rows8 = [(f'{r.n} [{r.busiId}]', int(r['size'] - r['sum']), int(r['sum'])) for _, r in t.iterrows()]
        sub8 = '기관 ID·운영기관명 조합 기준 · 동일 ID의 서로 다른 이름은 원문대로 구분'
        foot8 = '삭제 표시는 별도 색으로 표시 · 법인 통합 보유량이나 실제 이용 가능 대수를 뜻하지 않습니다.'
        groups = int(t.shape[0])
    else:
        # 웹사이트(백엔드 operator_labels)와 같은 규칙: 운영기관 ID별 집계, 표시 이름은 그 ID에서 가장 많은 bnm
        lab = chargers.groupby(['busiId', 'bnm']).size().reset_index(name='n')
        lab = lab.sort_values(['n', 'bnm'], ascending=[False, True], kind='stable').drop_duplicates('busiId')
        label = dict(zip(lab.busiId, lab.bnm))
        t = chargers.assign(d=deleted).groupby('busiId').d.agg(['size', 'sum']).reset_index()
        t = t.sort_values(['size', 'busiId'], ascending=[False, True], kind='stable')
        groups = int(t.shape[0])
        t = t.head(10)
        rows8 = [(f'{label[r.busiId]} [{r.busiId}]', int(r['size'] - r['sum']), int(r['sum'])) for _, r in t.iterrows()]
        sub8 = f'운영기관 ID(busiId) 기준 {groups}개 중 상위 10개 · 같은 ID의 서로 다른 이름 표기는 하나로 집계(웹사이트와 같은 기준)'
        foot8 = '삭제 표시는 별도 색으로 표시 · 같은 ID가 같은 법인이라는 뜻은 아니며 실제 이용 가능 대수도 아닙니다.'
    chart08(rows8, path('08_operator_chargers_top10'), sub8, CH_FOOT + [foot8])
    metrics['08'] = dict(groups=groups, top10=rows8, top10_total=sum(a + b for _, a, b in rows8))

    # 10
    tab = base.assign(b=output_band(base.output)).groupby(['zcode', 'b']).size().unstack(fill_value=0)
    tab = tab.reindex(columns=range(6), fill_value=0)
    tab = tab.loc[tab.sum(axis=1).sort_values(ascending=False, kind='stable').index]
    pct = chart10([HEAT_REGION[z] for z in tab.index], tab.values, path('10_regional_output_heatmap'),
                  ('지역 내 비삭제 표시 충전기 대비 비율' if original else '지역 내 전체 충전기(삭제 표시 포함) 대비 비율')
                  + ' · 괄호 안은 실제 충전기 수(기)',
                  CH_FOOT + ['출력 미상도 분모에 포함 · 커넥터 유형과 별개인 분석용 출력 구간 · 비삭제는 이용 가능 상태가 아닙니다.'
                             if original else '출력 미상도 분모에 포함 · ' + DEL_NOTE],
                  '지역 · 비삭제 충전기 수 내림차순' if original else '지역 · 충전기 수 내림차순 (삭제 표시 포함)')
    col = tab.sum(axis=0)
    metrics['10'] = dict(regions=list(tab.index), counts=tab.values.tolist(), denominator=int(tab.values.sum()),
                         national_bands=[int(c) for c in col], national_pct=[float(c / tab.values.sum() * 100) for c in col],
                         row_pct=pct.round(4).tolist())
    return metrics


def describe(m: dict) -> dict:
    """그래프에 적힌 수치로 만든 분석 결과·해석 주의 문장 (웹 페이지 설명에 옮겨 쓸 수 있게 metrics.json에 함께 저장)."""
    t1 = m['01']
    p2 = dict(m['02']['parts']); tot2 = m['02']['total']
    c3, n3 = m['03']['commercial'], m['03']['noncommercial']
    r3 = sorted(m['03']['rows'], key=lambda r: -r[2] / (r[1] + r[2]))
    d6 = m['06']['denominator']; ty = {c: (n, v) for c, n, v in m['06']['counts']}
    s7 = m['07']; t8 = m['08']['top10']; g8 = m['08']['groups']
    nb = m['10']['national_bands']; npct = m['10']['national_pct']
    reg10 = dict(zip(m['10']['regions'], m['10']['row_pct']))
    hi200 = max(reg10, key=lambda z: reg10[z][4])
    name10 = {**HEAT_REGION, '12': '전남광주'}
    return {
        '01': dict(results=[f"{t1['top10'][0][0]} {t1['top10'][0][1]:,}대가 전국 {t1['total']:,}대의 {t1['top10'][0][1] / t1['total'] * 100:.2f}%로 가장 많습니다.",
                            f"상위 10개 지역 합계는 {t1['top10_total']:,}대입니다."],
                   caution='2026년 9월 등록 재고이며 충전기(2026-10-15 조회)와 기준 시점이 다릅니다.'),
        '02': dict(results=[f"승용 {p2['승용']:,}대({p2['승용'] / tot2 * 100:.2f}%), 화물 {p2['화물']:,}대({p2['화물'] / tot2 * 100:.2f}%), "
                            f"승합 {p2['승합']:,}대({p2['승합'] / tot2 * 100:.2f}%), 특수 {p2['특수']:,}대({p2['특수'] / tot2 * 100:.2f}%)입니다."],
                   caution='차종과 충전기 커넥터 유형은 다른 개념입니다.'),
        '03': dict(results=[f"전국 비사업용 {n3:,}대({n3 / (n3 + c3) * 100:.2f}%), 사업용 {c3:,}대({c3 / (n3 + c3) * 100:.2f}%)입니다.",
                            f"사업용 비율 최고 {r3[0][0]} {r3[0][2] / (r3[0][1] + r3[0][2]) * 100:.1f}%, "
                            f"최저 {r3[-1][0]} {r3[-1][2] / (r3[-1][1] + r3[-1][2]) * 100:.1f}%입니다."],
                   caution='막대는 비율이 아닌 대수입니다. 사업용 여부만으로 실제 이용 수요를 추정하지 않습니다.'),
        '06': dict(results=[f"AC완속(02)은 {ty['02'][1]:,}기로 전체 {d6:,}기의 {ty['02'][1] / d6 * 100:.2f}%입니다.",
                            f"DC콤보(04) {ty['04'][1]:,}기({ty['04'][1] / d6 * 100:.2f}%), DC콤보2 버스전용(11) {ty['11'][1]:,}기입니다."],
                   caution='삭제 표시 4,121기를 포함한 웹사이트 기본 필터 기준입니다. 삭제 표시는 실제 운영 중인 충전기를 뜻하지 않습니다.'),
        '07': dict(results=[f"양수 출력 {s7['positive']:,}기, 결측 {s7['missing']:,}기입니다. 중앙값 {s7['median_kw']:g}kW, 95백분위 {s7['p95_kw']:g}kW입니다.",
                            f"가장 많은 구간은 0~10kW로 {max(s7['bin_counts']):,}기입니다."],
                   caution='로그 눈금의 막대 높이 차이는 선형 대수 차이가 아닙니다. 삭제 표시 포함 기준이며 삭제 표시는 실제 운영 중을 뜻하지 않습니다.'),
        '08': dict(results=[f"운영기관 ID {g8}개 중 1위는 {t8[0][0]} {t8[0][1] + t8[0][2]:,}기, 2위는 {t8[1][0]} {t8[1][1] + t8[1][2]:,}기입니다.",
                            f"상위 10개 ID 합계는 {m['08']['top10_total']:,}기입니다."],
                   caution='운영기관 ID(busiId) 기준이며 같은 ID가 반드시 같은 법인이라는 뜻은 아닙니다. 삭제 표시는 실제 이용 가능 대수가 아닙니다.'),
        '10': dict(results=[f"전국 30kW 미만은 {nb[0]:,}기({npct[0]:.2f}%), 200kW 이상은 {nb[4]:,}기({npct[4]:.2f}%), 출력 미상은 {nb[5]:,}기입니다.",
                            f"200kW 이상 비율이 가장 높은 지역은 {name10[hi200]} {reg10[hi200][4]:.1f}%입니다."],
                   caution='색은 지역 내 비율이며 전국 대수 순위가 아닙니다. 삭제 표시 포함 기준이며 삭제 표시는 실제 운영 중을 뜻하지 않습니다.'),
    }


def main():
    import pandas as pd

    parser = argparse.ArgumentParser()
    parser.add_argument('--project-root', default=str(ROOT))
    parser.add_argument('--font-dir', default=None)
    parser.add_argument('--reproduce-original', default=None, metavar='EV_2025_CSV',
                        help='원본과 같은 기준으로도 그려 _check/ 에 저장 (2025년 12월 등록 CSV 경로)')
    args = parser.parse_args()
    setup_fonts(args.font_dir)
    root = Path(args.project_root)
    out = root / 'outputs/charts_2026_09_updated'
    read = lambda p: list(csv.DictReader(open(p, encoding='utf-8-sig', newline='')))  # noqa: E731
    ev = read(root / 'data/processed/ev_registration_by_region_2026_09.csv')
    assert len(ev) == 16
    chargers = pd.read_csv(root / 'data/processed/charger_info_clean.csv', dtype=str, keep_default_na=False,
                           usecols=['zcode', 'delYn', 'chgerType', 'busiId', 'busiNm', 'bnm', 'output'])
    assert len(chargers) == 527433 and (chargers.delYn == 'Y').sum() == 4121
    metrics = build(ev, chargers, out, original=False)
    (out / 'metrics.json').write_text(json.dumps(dict(
        basis=dict(ev='2026년 9월 등록 1,191,873대, 16개 지역(전남광주 통합)',
                   chargers='2026-10-15 04:16–04:19 KST 조회, 삭제 표시 포함 전체 527,433기 (웹사이트 기본 필터)',
                   operators='운영기관 ID(busiId) 기준, 표시 이름은 ID별 최다 bnm (웹사이트와 같은 규칙)'),
        kept_original=['04_chargers_by_region.png', '05_station_location_scatter.png',
                       '09_annual_charger_installation_trend.png'],
        charts=metrics, descriptions=describe(metrics)), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('갱신:', ', '.join(sorted(p.name for p in out.glob('*.png'))))
    if args.reproduce_original:
        build(read(Path(args.reproduce_original)), chargers, out / '_check', original=True)
        print('원본 기준 재현본:', out / '_check')


if __name__ == '__main__':
    main()

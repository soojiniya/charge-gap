"""처음 제작한 Python 원본 그래프(outputs/charts/)의 스타일로, 현재 웹사이트 자료 기준 그래프를 다시 그립니다.

원본 생성 스크립트는 저장소에 없어서, 원본 PNG를 픽셀 단위로 측정한 값(크기·여백·색·글자 크기·막대 두께·축 범위 규칙)으로
스타일을 되살렸습니다. 같은 2025년 12월 자료로 다시 그려 원본과 겹쳐 보면 글자 줄·막대 위치가 0~2px 이내로 맞습니다.

현재 포함된 그래프 (시범)
- 01 지역별 전기차 등록 대수 TOP 10: data/processed/ev_registration_by_region_2026_09.csv (2026년 9월, 16개 지역, 전남광주 통합)

출력
- outputs/charts_2026_09_updated/01_ev_registration_top10.png
  (원본 outputs/charts/ 와 다크 테마 frontend/public/python-charts/ 는 읽기만 하거나 건드리지 않음)

글꼴: 원본과 같은 맑은 고딕(Malgun Gothic). Windows에서는 C:\\Windows\\Fonts 의 글꼴을 그대로 씁니다.
다른 환경에서는 --font-dir 로 malgun*.ttf 가 있는 폴더를 지정합니다.

실행 예
  python scripts/create_original_style_charts_2026.py
  python scripts/create_original_style_charts_2026.py --reproduce-2025 data/processed/ev_registration_by_region_2025.csv
    (2025년 12월 자료로 원본 01을 다시 그려 outputs/charts_2026_09_updated/_check/ 에 저장: 재현 정확도 확인용)
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager as fm  # noqa: E402
from matplotlib.ticker import FuncFormatter, MultipleLocator  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--project-root', default=str(ROOT))
parser.add_argument('--font-dir', default=None, help='malgun.ttf·malgunbd.ttf(또는 *_sub.ttf)가 있는 폴더')
parser.add_argument('--reproduce-2025', default=None, help='2025년 12월 CSV 경로: 원본 01 재현 확인용 PNG도 만듦')
args = parser.parse_args()
P_ROOT = Path(args.project_root)
OUT = P_ROOT / 'outputs/charts_2026_09_updated'

# ---------------------------------------------------------------- 글꼴 (원본: Malgun Gothic)
font_dirs = [Path(args.font_dir)] if args.font_dir else [Path('C:/Windows/Fonts'), Path.home() / '.fonts_cg']
for d in font_dirs:
    for f in sorted(d.glob('malgun*.ttf')) if d.exists() else []:
        fm.fontManager.addfont(str(f))
if 'Malgun Gothic' not in {f.name for f in fm.fontManager.ttflist}:
    raise SystemExit('맑은 고딕(Malgun Gothic) 글꼴을 찾지 못했습니다. --font-dir 로 malgun.ttf 위치를 지정하세요.')
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False

# ---------------------------------------------------------------- 원본 PNG에서 측정한 스타일
TITLE, MUTED, TICK, LABEL = '#132E44', '#697D8F', '#526575', '#334155'
BAR, GRID, SPINE = '#276C9B', '#E7EEF4', '#CBD5E1'
DPI = 200

# 01번 (2400×1500): 위치는 원본 픽셀 좌표, 글자 크기는 pt
G01 = dict(W=2400, H=1500, ax_l=251.5, ax_r=2243, ax_t=314, ax_b=1155.5, ylim=(9.781, -0.812), bar_h=0.579,
           xmax_k=1.22, tick_step=50000, grid_lw=0.8, spine_lw=1.1, tick_fs=11, tick_pad=9, ytick_fs=12, ytick_pad=8,
           label_fs=11.2, xlabel_pad=4.3, ylabel_pad=3.5, val_off=0.012, val_fs=10.5,
           text_x=157, title_y=148, title_fs=20.8, sub_y=213, sub_fs=10.4, foot_y=(1348, 1400, 1453), foot_fs=8.5)


def chart01(rows: list[tuple[str, int]], out: Path, subtitle: str, footer: list[str]) -> None:
    """지역별 전기차 등록 대수 TOP 10 (가로 막대, 원본 01과 같은 배치)."""
    g = G01
    W, H = g['W'], g['H']
    fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI, facecolor='white')
    ax = fig.add_axes([g['ax_l'] / W, 1 - g['ax_b'] / H, (g['ax_r'] - g['ax_l']) / W, (g['ax_b'] - g['ax_t']) / H])
    names = [r[0] for r in rows]
    vals = [r[1] for r in rows]
    y = list(range(len(rows)))
    ax.barh(y, vals, height=g['bar_h'], color=BAR, zorder=3)
    ax.set_yticks(y, names)
    ax.set_ylim(*g['ylim'])
    vmax = max(vals)
    ax.set_xlim(0, vmax * g['xmax_k'])
    ax.xaxis.set_major_locator(MultipleLocator(g['tick_step']))
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f'{int(v):,}'))
    ax.grid(axis='x', color=GRID, linewidth=g['grid_lw'], zorder=0)
    ax.set_axisbelow(True)
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
    for s in ('left', 'bottom'):
        ax.spines[s].set_color(SPINE)
        ax.spines[s].set_linewidth(g['spine_lw'])
    ax.tick_params(axis='both', length=0, colors=TICK, labelsize=g['tick_fs'], pad=g['tick_pad'])
    ax.tick_params(axis='y', labelsize=g['ytick_fs'], pad=g['ytick_pad'])
    ax.set_xlabel('전기차 등록 대수 (대)', fontsize=g['label_fs'], color=LABEL, labelpad=g['xlabel_pad'])
    ax.set_ylabel('지역', fontsize=g['label_fs'], color=LABEL, labelpad=g['ylabel_pad'])
    for yi, v in zip(y, vals):
        ax.text(v + vmax * g['val_off'], yi, f'{v:,}', va='center', ha='left', fontsize=g['val_fs'], color=TITLE)
    fig.text(g['text_x'] / W, 1 - g['title_y'] / H, '지역별 전기차 등록 대수 TOP 10', fontsize=g['title_fs'],
             weight='bold', color=TITLE, va='baseline')
    fig.text(g['text_x'] / W, 1 - g['sub_y'] / H, subtitle, fontsize=g['sub_fs'], color=MUTED, va='baseline')
    for line, fy in zip(footer, g['foot_y']):
        fig.text(g['text_x'] / W, 1 - fy / H, line, fontsize=g['foot_fs'], color=MUTED, va='baseline')
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=DPI, facecolor='white')
    plt.close(fig)


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------- 01: 2026년 9월, 16개 지역
ev = read_csv(P_ROOT / 'data/processed/ev_registration_by_region_2026_09.csv')
assert len(ev) == 16, '2026년 9월 자료는 16개 지역이어야 합니다'
total = sum(int(r['ev_registration_count']) for r in ev)
name = lambda r: '전남광주' if r['region_code'] == '12' else r['region_name']  # noqa: E731 (웹사이트와 같은 짧은 이름)
top10 = sorted(((name(r), int(r['ev_registration_count'])) for r in ev), key=lambda x: (-x[1], x[0]))[:10]
chart01(top10, OUT / '01_ev_registration_top10.png', '순수 전기차 · 2026년 9월 16개 지역 기준',
        ['출처: 2026년 9월 자동차 등록자료 · 전처리 ev_registration_by_region_2026_09.csv',
         '기준: 2026년 9월',
         '광주·전남은 전남광주로 통합(웹사이트와 같은 16개 지역) · 충전기 현황과 기준 시점이 다릅니다.'])
print(f'01: 전국 {total:,}대, TOP 10 합계 {sum(v for _, v in top10):,}대, 1위 {top10[0][0]} {top10[0][1]:,}대 '
      f'({top10[0][1] / total * 100:.2f}%)')

# ---------------------------------------------------------------- 재현 확인용: 원본과 같은 2025년 12월 자료
if args.reproduce_2025:
    old = read_csv(Path(args.reproduce_2025))
    old_top = sorted(((r['region_name_2025'], int(r['ev_registration_count'])) for r in old), key=lambda x: -x[1])[:10]
    chart01(old_top, OUT / '_check/01_ev_registration_top10_reproduced_2025.png', '순수 전기차 · 2025년 당시 17개 시도 기준',
            ['출처: 2025년 12월 자동차 등록자료 · 전처리 ev_registration_by_region_2025.csv', '기준: 2025년 12월',
             '광주·전남은 원래 지역 구분 유지 · 충전기 현황과 기준 시점이 다릅니다.'])
    print('재현 확인용 PNG:', OUT / '_check/01_ev_registration_top10_reproduced_2025.png')

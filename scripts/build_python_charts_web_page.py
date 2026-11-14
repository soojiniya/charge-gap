"""Python Visualization 페이지용 정적 파일을 만듭니다.

outputs/charts_web_matched_2026/ (scripts/create_web_matched_charts_2026.py 결과)의 PNG 10개를
frontend/public/python-charts-web/ 에 바이트 그대로 복사하고, metrics.json 을 기준으로 웹 표시용 charts.json 을 씁니다.
기존 outputs/charts, outputs/charts_2026_09_updated, frontend/public/python-charts(다크), python-charts-original 은 건드리지 않습니다.

실행: python scripts/build_python_charts_web_page.py
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'outputs/charts_web_matched_2026'
OUT = ROOT / 'frontend/public/python-charts-web'
OUT.mkdir(parents=True, exist_ok=True)
M = json.loads((SRC / 'metrics.json').read_text(encoding='utf-8'))

REGIONS = {1: '16개 시도 (전남광주 통합)', 2: '전국 (16개 시도 합계)', 3: '16개 시도 (전남광주 통합)', 4: '16개 시도 (전남광주 통합)',
           5: '16개 시도 (전남광주 통합)', 6: '전국 (16개 시도 합계)', 7: '전국 (16개 시도 합계)', 8: '16개 시도 (전남광주 통합)',
           9: '전국 (지역 구분 없음)', 10: '전국 (16개 시도 합계)'}
PURPOSE = {
    1: '지역별 전기차 등록 규모를 비교하고 등록이 몰린 지역을 확인합니다.',
    2: '전국 전기차가 어떤 차종으로 구성되는지 비율로 확인합니다.',
    3: '지역마다 사업용 전기차 비중이 얼마나 다른지 같은 100% 기준으로 비교합니다.',
    4: '지역의 충전소 수와 충전기 수가 얼마나 선형적으로 함께 늘어나는지 확인합니다.',
    5: '충전소 한 곳에 충전기가 몇 기씩 있는지 지역별 분포(중앙값·사분위·이상치)로 비교합니다.',
    6: '충전기가 어떤 공식 커넥터 유형으로 구성되는지 확인합니다.',
    7: '충전기 정격 출력이 어떤 값에 몰려 있는지 분포와 KDE 곡선으로 확인합니다.',
    8: '지역마다 출력 구간(저출력~고출력) 구성이 어떻게 다른지 비율로 비교합니다.',
    9: '2011년부터 충전기 누적 설치가 어떻게 늘었는지 추세를 확인합니다.',
    10: '운영기관(운영기관 ID) 사이에 충전기 규모가 얼마나 집중돼 있는지 확인합니다.',
}
CAUTION = {
    1: '등록 대수는 등록지 기준 절대 대수이며 인구·전체 차량 수를 반영한 보급률이 아닙니다.',
    2: '등록 대수 구성비이며 운행량이나 충전 수요 비율이 아닙니다.',
    3: '구성비만으로는 지역별 절대 대수를 알 수 없습니다. 웹의 "대수" 보기는 이 이미지에 포함하지 않았습니다.',
    4: '지역 단위 상관관계이며 인과관계가 아닙니다. 점이 16개뿐이고 경기·서울이 회귀선을 크게 좌우합니다.',
    5: "웹 기본 필터(삭제 표시 '전체')에서도 이 그래프만 비삭제 표시(N) 충전기로 집계해 표본이 100,590곳입니다. 이상치는 오류 판정이 아니며 제거하지 않았습니다.",
    6: '커넥터 유형만으로 급속·완속을 다시 분류하지 않습니다.',
    7: '정격 출력이며 실제 충전 속도가 아닙니다. 7kW 구간 막대(406,962기)는 같은 구간의 6kW 1기를 포함합니다. KDE는 평활 추정입니다.',
    8: '색은 열(출력 구간)마다 따로 정한 상대값이라 미상 열처럼 값이 작아도 색 차이가 클 수 있습니다. 칸 숫자는 반올림 값입니다.',
    9: '연도별 공식 설치 통계의 누적값이며 API 충전기 현황(현재 재고)과 모집단이 다릅니다. 2026년은 부분 연도입니다.',
    10: '운영기관 ID(busiId) 기준이며 같은 ID가 같은 법인이라는 뜻은 아닙니다. 면적은 충전기 수이며 소유 관계가 아닙니다.',
}


def libraries(funcs: list[str]) -> list[str]:
    text = ' '.join(funcs)
    libs = []
    if any(k in text for k in ('matplotlib', 'Axes', 'patches')):
        libs.append('Matplotlib')
    if 'seaborn.set_theme' in text and not any(f.startswith('seaborn.') and 'set_theme' not in f for f in funcs):
        libs.append('Seaborn (테마)')
    elif 'seaborn.' in text:
        libs.append('Seaborn')
    if 'SciPy' in text:
        libs.append('SciPy')
    return libs


def gwa(word: str) -> str:  # 받침 유무에 맞는 '과/와' (PythonChartView.tsx gwa 와 같은 규칙)
    ch = word.rstrip(' )]”"\'')[-1]
    code = ord(ch) - 0xAC00
    return '과' if 0 <= code <= 11171 and code % 28 else '와'


charts = []
for c in M['charts']:
    src = SRC / c['file']
    dst = OUT / c['file']
    shutil.copyfile(src, dst)
    data = dst.read_bytes()
    assert data == src.read_bytes() and hashlib.sha256(data).hexdigest() == c['sha256'], c['file']
    i = c['id']
    charts.append({
        'id': i, 'file': c['file'], 'title': c['title'], 'technique': c['chart_type'], 'libraries': libraries(c['functions']),
        'functions': c['functions'], 'data_date': c['data_date'], 'basis': c['basis'], 'regions': REGIONS[i], 'deletion': c['deletion'],
        'results': c['results'], 'caution': CAUTION[i], 'web': {'graph': i, 'title': c['web_title']},
        'image_pixels': c['image_pixels'], 'sha256': c['sha256'], 'source': c['source'], 'purpose': PURPOSE[i],
        'data_files': f"{c['data_file']} · 웹 대응 API {c['web_api']}",
        'filter': c['web_default_filter'],
        'relation': f"웹 그래프 {i} “{c['web_title']}”{gwa(c['web_title'])} 같은 그래프 종류·자료·집계 기준(웹 기본 필터: {c['web_default_filter']})으로 다시 구현했으며, "
                    '웹 API 대조 46/46·실제 화면 대조 13/13 항목이 일치했습니다(outputs/charts_web_matched_2026/verification.md).',
    })
d = M['data']
meta = {
    'title': 'Python 데이터 시각화 그래프 (웹사이트 그래프 1~10 Python 구현)',
    'generator': 'scripts/create_web_matched_charts_2026.py → scripts/build_python_charts_web_page.py',
    'generated_at': M['generated_at'],
    'libraries': M['libraries'],
    'font': M['font'],
    'fixed_notice': '현재 웹사이트 그래프 1~10과 같은 그래프 종류·자료·집계 기준(웹 기본 필터)을 Matplotlib·Seaborn으로 다시 구현한 고정 이미지입니다. 웹사이트 필터를 바꿔도 달라지지 않습니다.',
    'data': {
        'ev_registration': {'date': d['ev_registration']['date'], 'total': d['ev_registration']['total'], 'regions': d['ev_registration']['regions'],
                            'source': M['charts'][0]['source']},
        'chargers': {**{k: d['chargers'][k] for k in ('date', 'snapshot', 'total', 'not_deleted', 'deleted')},
                     'basis': '전체 (삭제 표시 포함) = 웹 기본 필터 · 그래프 5만 비삭제 표시', 'source': M['charts'][3]['source']},
        'growth': d['growth'],
    },
    'verification': {'api': '46/46', 'screen': '13/13'},
    'charts': charts,
}
(OUT / 'charts.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps([(c['id'], c['libraries']) for c in charts], ensure_ascii=False))

# CHARGE GAP 그래프 구성과 API 지원 현황

웹 대시보드 v2(분석 중심 리디자인) 기준입니다. 모든 그래프는 기존 Flask API 응답만 사용합니다.
API로 만들 수 없는 그래프는 가짜 값을 만들지 않고 **미완료**로 표시했습니다.

## 1. 그래프 10종

| # | 그래프 | 형태 | 수업 자료 대응 | 페이지 | 데이터 (기존 API) | 상태 |
|---|---|---|---|---|---|---|
| 1 | 지역별 전기차 등록 대수 | 가로 막대 | `barh`, `countplot(y=)` | Overview, EV | `/api/ev-registration` 17행 | 완료 |
| 2 | 차종별 등록 구성 | 가로 롤리팝 (등록 대수 순) | `hlines` + `scatter` | EV | 같은 응답의 차종 4종 (등록 지역 필터 반영) | 완료 |
| 3 | 지역별 사업용·비사업용 전기차 구성 | 기본: 100% 누적 가로 막대(사업용 비율 내림차순, 막대 안 사업용 비율, Python PY03과 같은 기준). 토글로 대수 누적 막대 | `barh(stacked)` | EV | `ev_commercial_count`, `ev_noncommercial_count` | 완료 |
| 4 | 지역별 충전소 수 대 충전기 수 | 산점도 + 최소제곱 회귀선 | `scatter`, `regplot`/`lmplot` | Overview, Regional | `/api/charger-regions` 16행 (회귀·상관은 프론트 계산) | 완료 |
| 5 | 충전소당 충전기 수 분포 | 지역별 가로 박스플롯 (로그/선형 축) | `boxplot` | Infra | `/api/station-size-distribution` (v2 추가) | 완료 |
| 6 | 충전기 유형별 구성 | 도넛 (상위 4 + 기타) | `pie` | Overview, Infra | `/api/charger-types` | 완료 |
| 7 | 충전기 출력 분포 | 히스토그램 + KDE, 로그 x축 | `histplot(kde=True)`, `distplot` | Infra | `/api/charger-output`의 출력값별 건수 | 완료 |
| 8 | 지역별 출력 구간 구성 | 행 비율 히트맵 (annot) | `heatmap(annot=True)` | Regional | `/api/charger-output?region_code=XX` 16회 | 완료 |
| 9 | 연도별 누적 설치 추이 | 영역 그래프, 2026 부분 연도 구분 | `fill_between`, `lineplot` | Overview, Growth | `/api/growth` | 완료 |
| 10 | 운영기관별 충전기 규모 | 트리맵 (상위 20 + 기타) | (squarify 트리맵) | Infra | `/api/operators?limit=20` + `meta.matched` | 완료 |
| 보조 | 연간 설치 수 | 세로 막대 (부분 연도 빗금) | `bar` | Growth | `/api/growth` | 완료 |
| 보조 | 충전소 지도 | 시도 버블 / bbox 충전소 점 | — | Regional | `/api/charger-regions`, `/api/locations` | 완료 |

서로 다른 그래프 형태: 가로 막대, 가로 롤리팝, 도넛, 100% 누적 막대, 산점도+회귀선, 박스플롯, 히스토그램+KDE, 히트맵, 영역, 트리맵, 세로 막대, 지도 — **12종**.

### 프론트엔드에서 하는 계산 (모두 실제 응답 기반)

- 그래프 4: 16개 지역 점으로 피어슨 r, 최소제곱 기울기·절편, R² (`src/lib/stats.ts`).
- 그래프 5: 계산 없음. API의 q1·median·q3·whisker_low·whisker_high·outlier_distribution·mean을 그대로 그립니다(수염 재계산 없음, min/max는 툴팁·표에만 표시).
- 그래프 7: 출력값별 건수를 log10 등폭 구간(0.125)에 합산. KDE는 건수를 가중치로 한 가우시안 커널이며, 대역폭은 구간 폭으로 고정했습니다(값이 7kW에 77% 몰려 있어 Scott/Silverman 규칙은 IQR=0으로 대역폭이 0에 가까워집니다).
- 그래프 8: 출력값을 보고서 PNG 10과 같은 6개 구간(<30, 30–50, 50–100, 100–200, ≥200kW, 미상)으로 합산. 경기도·비삭제 기준 값이 PNG 10 메타데이터(140,694 / 578 / 2,694 / 7,104 / 3,764 / 43)와 일치하는 것을 확인했습니다.
- 그래프 10: '기타' = `meta.matched.charger_count` − 상위 20개 합.

### 그래프별 분석 문단

모든 주요 그래프 아래에 분석 목적, 그래프 선택 이유, 주요 결과, 해석, 주의사항, 데이터 출처·사용 변수를 둡니다 (`src/analysis/insights.tsx`).
주요 결과와 해석의 수치는 그 그래프가 받은 API 응답으로 매번 계산합니다. 필터가 반영되면 "현재 필터 결과로 계산한 요약", 반영되지 않으면 "전국 기준 고정 분석"이라고 표시합니다.

## 2. 그래프 5 박스플롯 연결 (완료)

백엔드가 추가한 `GET /api/station-size-distribution`(backend/API_SPEC.md, reports/station_size_api_handoff.md)에 연결했습니다.

| 화면 요소 | API 필드 |
|---|---|
| 상자 | `q1` ~ `q3` (선형 보간 사분위수) |
| 중앙선 | `median` |
| 수염과 끝 막대 | `whisker_low` ~ `whisker_high` (1.5×IQR 울타리 안 실제 최소·최대). `min`/`max`는 수염에 쓰지 않고 툴팁·표에만 표시 |
| 이상치 점 | `outlier_distribution[].charger_count` 위치에 값마다 점 1개, 점 크기 = `station_count`(빈도). 지터 없음 |
| 평균 마름모 | `mean` |
| 지역 라벨 | `region_name`, `n = sample_count` |

- 요청변수: 화면의 지역·유형·운영기관 필터를 그대로 보냅니다. 삭제 표시는 백엔드 권장에 따라 필터가 '전체'이면 `deletion=not_deleted`, '비삭제 표시'면 `not_deleted`, '삭제 표시'면 `deleted`로 보냅니다(카드에 안내 문구 표시).
- 빈 결과(예: 09 NACS)는 빈 상태 안내, 400 오류는 오류 코드·변수를 표시합니다.
- 검증: 전국 비삭제 16개 지역의 사분위수·수염·이상치 분포·평균을 원본 CSV로 NumPy 재계산해 API와 전부 일치, 화면의 상자·중앙선·수염·이상치 점 좌표를 API 값의 축 변환과 대조해 16행 모두 일치(±0.6px)했습니다.

## 3. 보고서용 Python 그래프 (백엔드에서 완료)

백엔드 담당자가 `outputs/charts_v2_report/`에 v2 그래프 10종(v2_01~v2_10)을 제작했습니다. 아래는 당시 요청 목록이며, 웹 화면은 기존 `/api/charts`의 PNG 10개 목록을 그대로 표시합니다(v2 PNG는 API로 제공되지 않아 웹에 표시하지 않음).

### 당시 작업 목록

기존 검증된 PNG 10개는 그대로 보존합니다(웹은 `/api/charts`로 표시만 함). 과제 보고서에서 웹 그래프와 같은 형태의 Matplotlib/Seaborn 그림이 필요하면 아래를 **새 파일 이름으로** 추가 제작합니다.

| 우선 | 새 그래프 | 라이브러리 | 입력 | 비고 |
|---|---|---|---|---|
| 2 | 충전소 수 대 충전기 수 산점도 + 회귀선 | `sns.regplot` | `charger_region_summary.csv` | r, 기울기를 웹 값과 대조 |
| 3 | 출력 분포 히스토그램 + KDE | `sns.histplot(log_scale=True, kde=True, weights=...)` | `charger_output_summary.csv` | 기존 PNG 07은 선형 구간 막대 |
| 4 | 운영기관 트리맵 | `squarify.plot` | `charger_operator_summary.csv` | squarify 패키지 추가 필요 |
| 5 | 사업용·비사업용 100% 누적 막대 | `DataFrame.plot.barh(stacked=True)` | `ev_registration_by_region_2025.csv` | 기존 PNG 03은 절대 대수 누적 |
| 6 | 누적 설치 영역 그래프 | `plt.fill_between` | `charger_installation_trend.csv` | 2026 부분 연도 음영 |
| 7 | 유형 구성 도넛 (상위 4 + 기타) | `plt.pie(wedgeprops={'width':.35})` | `charger_type_summary.csv` | 기존 PNG 06은 비삭제 기준 파이 |

각 그림에 대해 기존 `reports/chart_verification.json`과 같은 메타데이터(목적, 기간, 결과, 주의, sha256)를 남기면 `/api/charts`에 그대로 추가할 수 있습니다.

## 4. 지도 타일

- 이전 CARTO 타일을 쓸 때 지도에 "API KEY REQUIRED"가 표시되어, 인증키가 필요 없는 OpenStreetMap 표준 타일(`tile.openstreetmap.org`)로 바꿨습니다.
- [OSM 타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/)에 따라 지도 오른쪽 아래에 "© OpenStreetMap contributors"를 표시하고, 대량 다운로드나 사전 캐싱을 하지 않습니다. 과제·시연 규모의 사용을 전제로 합니다.
- 어두운 테마에 맞추기 위해 타일 이미지에 CSS 필터만 적용합니다(타일 원본 변경 없음). 지도 위 "끄기" 버튼으로 배경 지도 없이 데이터 점만 볼 수 있습니다.
- 배포 등으로 트래픽이 커지면 `.env`의 `VITE_TILE_URL`로 이용 약관에 맞는 다른 타일 서버(자체 타일 서버, 상용 키 등)를 지정합니다.

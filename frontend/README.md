# CHARGE GAP 프론트엔드

대한민국 전기차 보급 및 충전 인프라 현황 분석 대시보드입니다. React 18, TypeScript, Vite로 만들었습니다.
모든 수치는 기존 Flask 백엔드(`backend/`)의 실제 API 응답에서 가져옵니다. 프론트엔드에 하드코딩한 통계는 없습니다.

## 실행 방법 (Windows PowerShell)

필요한 것: Node.js 24(이번 검증은 24.21.0), 이미 완성된 Flask 백엔드. 패키지의 최소 엔진 범위는 `^20.19.0 || >=22.12.0`이며 실제 운영에서는 보안 지원 중인 버전을 사용하세요. 프로젝트 전체 준비와 데이터 별도 공급은 [상위 README](../README.md)를 확인하세요.

**1. 백엔드 실행** (터미널 1, 기존 방식 그대로)

```powershell
Set-Location 'C:\Users\User\Documents\Codex\CHARGE GAP\backend'
.\.venv\Scripts\python.exe run.py
```

`http://127.0.0.1:5000`에서 CSV를 읽어 들이는 데 수 초가 걸립니다.

**2. 프론트엔드 실행** (터미널 2)

```powershell
Set-Location 'C:\Users\User\Documents\Codex\CHARGE GAP\frontend'
npm ci
npm run dev
```

브라우저에서 **http://localhost:5173** 을 엽니다.
Vite 포트는 5173으로 고정했습니다. 백엔드의 기본 CORS 허용 origin(`http://localhost:5173`, `http://127.0.0.1:5173`)과 맞추기 위해서이며, 백엔드 설정을 바꿀 필요가 없습니다.

**배포용 빌드**

```powershell
npm run build      # dist/ 생성 (타입 검사 포함)
npm run preview    # http://localhost:5173 에서 빌드 결과 확인
```

`dist/`를 다른 주소에서 서비스한다면, 그 origin을 백엔드 실행 전에 `CHARGE_GAP_CORS_ORIGINS`에 추가해야 합니다(API_SPEC.md 참고).
이때 SPA 라우팅을 위해 모든 경로가 `index.html`로 가도록 설정해야 합니다.

**API 주소 변경** (선택): `.env.example`을 `.env`로 복사한 뒤 `VITE_API_BASE_URL`을 바꿉니다. 기본값은 `http://127.0.0.1:5000`입니다.

> 지도 배경은 인증키가 필요 없는 OpenStreetMap 표준 타일을 쓰며 인터넷 연결이 필요합니다(출처 표시 포함). 지도 위 "끄기"로 배경 없이 볼 수 있고, `.env`의 `VITE_TILE_URL`로 다른 타일 서버를 지정할 수 있습니다.

## 페이지와 그래프

과제용 그래프 10종의 형태, 데이터, 완료 여부는 **[docs/CHART_PLAN.md](docs/CHART_PLAN.md)**에 정리했습니다.

| 경로 | 페이지 | 그래프 |
|---|---|---|
| `/` | Overview | 기준 시점 띠, KPI 4개, 그래프 9(누적 영역), 6(유형 도넛), 4(산점도+회귀선), 1(지역 막대), 해석 기준, 보고서 PNG 10종 |
| `/ev-registration` | EV Registration | 등록 요약, 그래프 1(가로 막대), 2(차종 도넛), 3(사업용 비율 점 그래프, 100% 누적·대수 보기 전환), 등록 표 |
| `/charging-infrastructure` | Charging Infrastructure | 요약, 그래프 6(유형 도넛)과 유형 표, 7(히스토그램+KDE), 5(충전소당 충전기 수 박스플롯), 10(운영기관 트리맵), 운영기관 표 |
| `/regional-explorer` | Regional Explorer | 충전소 지도, 그래프 8(지역×출력 히트맵), 4(산점도), 지역 표, 충전소 목록, 보고서 PNG |
| `/growth-trends` | Growth Trends | 구간 요약, 연간 설치 막대, 그래프 9(누적 영역), 연도 표 |

모든 주요 그래프 아래에는 분석 목적, 그래프 선택 이유, 주요 결과, 해석, 주의사항, 데이터 출처·변수가 있습니다.
결과·해석의 수치는 그 그래프가 받은 실제 API 응답으로 계산하며(`src/analysis/insights.tsx`), 필터 반영 여부를 문단 위에 표시합니다.

## 필터와 API 요청변수

필터 상태는 URL 쿼리에 저장됩니다. 페이지를 옮겨도 유지되고, 링크로 같은 화면을 공유할 수 있습니다.

| 화면 필터 | URL | API 요청변수 | 적용 엔드포인트 |
|---|---|---|---|
| 충전기 지역 (16개) | `region` | `region_code` | overview, charger-regions/types/output, operators, locations |
| 충전기 유형 (01~11) | `type` | `charger_type` | 〃 |
| 삭제 표시 상태 | `deletion` | `deletion` (`all`이면 생략) | 〃 |
| 운영기관 | `operator` | `operator_id` | 〃 |
| 등록 지역 (17개) | `ev_region` | overview는 `ev_region_code`, ev-registration은 `region_code` | overview, ev-registration |
| 연도 구간 | `from`, `to` | `year_from`, `year_to` | growth |
| 페이지, 표시 개수 | 컴포넌트 상태 | `page`, `limit` | operators, locations |
| (박스플롯) | 위 충전기 필터 | `region_code`, `charger_type`, `operator_id`, `deletion`(전체 선택 시 `not_deleted`) | station-size-distribution |
| 지도 영역 | 지도 이동 | `bbox` | locations |

- 각 차트의 쿼리 키에는 그 엔드포인트가 실제로 받는 요청변수만 들어갑니다. 그래서 충전기 필터를 바꾸면 충전기 차트만 다시 요청되고, 등록·연도 차트는 다시 요청되지 않습니다. 카드 오른쪽 위 태그(`필터 적용` / `필터 무관`)가 이를 표시합니다.
- 차트 막대를 누르면 해당 지역·유형·운영기관으로 필터가 바뀝니다. 같은 막대를 다시 누르면 해제됩니다.
- 지역·유형 선택지는 `/api/overview`의 `meta.filter_options`, 운영기관 선택지는 `/api/operators`(limit=200, `next_page`를 따라 전체)에서 받습니다.
- 빈 값은 보내지 않습니다. 명세상 빈 값과 중복 변수는 400입니다. 400 응답은 `error.code`, `message`, `parameter`를 그대로 보여 주고 재시도하지 않습니다.

## 지도 동작 (`/api/locations`, 요청당 최대 1,000곳)

- 줌 11 미만에서는 `/api/charger-regions`의 시도별 충전기 수를 버블 크기로 그립니다. 버블 위치는 표시용 대표 지점이며 통계값이 아닙니다.
- 줌 11 이상에서는 현재 화면을 `bbox`로 보내 `limit=1000`으로 요청합니다. `next_page`를 따라 3페이지(3,000곳)까지는 자동으로 받고, 그 뒤는 "다음 1,000곳 불러오기" 버튼으로 이어 받습니다. HUD에 "표시 수 / 영역 내 전체 충전소 수"를 표시합니다.
- 점 색: 비삭제 충전기가 있는 충전소는 바이올렛, 모두 삭제 표시인 충전소는 앰버. 점 크기는 필터와 일치하는 충전기 수입니다.

## 데이터 정확성 원칙 (API_SPEC 준수)

- 전기차 등록(2025-12, 899,101대)과 충전기(2026-10-15 조회, 527,433기, 101,091곳)는 기준 시점이 달라 서로 나누지 않습니다. 충전기 1기당 차량 수나 충전 부족률은 어디에도 계산하지 않습니다.
- 광주·전남: 등록자료는 29 광주와 46 전남을 분리하고, 충전기 자료는 12 전남광주통합특별시를 사용합니다. 두 지역 선택은 서로 다른 컨트롤로 분리했고, 화면마다 통합 기준을 표시합니다.
- 비삭제 표시는 "이용 가능"이 아니라는 API 경고를 그대로 표시합니다.
- 출력 차트는 `positive_numeric`만 막대로 그리고 결측·무효 값은 따로 셉니다. 통계는 `meta.output_statistics`를 그대로 씁니다.
- 연도 통계의 누적값은 원본 그대로 쓰며, 2026년은 부분 연도로 빗금과 점선으로 구분합니다.
- 기존 PNG 10종은 `/api/charts` 메타데이터와 `/api/charts/{id}/image`로 표시하며, 필터가 적용되지 않는 고정 이미지라고 표시합니다.

## 파일 구조

```text
frontend/
  index.html
  package.json            # 버전 고정
  vite.config.ts          # 포트 5173 고정, 공통 라이브러리 청크 분리
  tsconfig.json
  .env.example            # VITE_API_BASE_URL
  public/favicon.svg
  docs/CHART_PLAN.md      # 그래프 10종 지원 현황, 미완료 API 명세, 백엔드 작업 목록
  src/
    main.tsx              # QueryClient, Router, 폰트, 전역 CSS
    App.tsx               # 라우트 (Overview 외 페이지는 지연 로딩)
    api/
      client.ts           # fetch, ApiError, URL 생성(빈 값 제외), HTTP 상태와 error 우선 확인
      endpoints.ts        # 9개 엔드포인트 함수, 요청변수 매핑
      hooks.ts            # TanStack Query 훅 (엔드포인트별 쿼리 키)
      types.ts            # API_SPEC/openapi.json 기반 응답 타입
    state/filters.ts      # URL 동기화 필터 상태
    analysis/insights.tsx # 그래프별 분석 문단 (실제 응답으로 결과·해석 계산)
    features/ChartCards.tsx # 과제용 그래프 10종 + 연간 설치 카드
    lib/stats.ts          # 상관·회귀·가중 히스토그램·KDE
    lib/format.ts         # 숫자, 백분율, 단위 표기
    charts/               # 재사용 차트 (Recharts)
      HBarChart.tsx  StackedHBar.tsx  ColumnChart.tsx  DonutChart.tsx  CumulativeChart.tsx
      RegionScatter.tsx  HistKde.tsx  Heatmap.tsx  OperatorTreemap.tsx  BoxPlot.tsx  CommercialDotPlot.tsx
      Tooltip.tsx  theme.ts
    components/
      layout/AppShell.tsx # 사이드바, 모바일 메뉴, 페이지 헤더(기준 시점 레일)
      FilterBar.tsx       # 지역, 유형, 삭제 표시, 운영기관, 등록 지역
      StationMap.tsx      # Leaflet 지도 (시도 버블, bbox 충전소)
      ReportGallery.tsx   # 보고서 PNG 갤러리
      DataNotes.tsx       # 지역 체계, 비율 미계산 안내
      ui/                 # Card, Insight(분석 문단), ChartDetail(상세 보기), Modal, DataTable, Pager,
                          # QueryState(로딩/빈 결과/오류), OperatorPicker, Icon
    pages/                # 5개 페이지
    styles/tokens.css     # 색, 글꼴, 반경 토큰
    styles/global.css     # 레이아웃, 컴포넌트, 반응형
```

## 디자인 메모 (v2)

- 바탕 `#10141C`, 카드 `#1B2230`, 보조 텍스트 `#8F9CAD`, 포인트 `#A49BC8`, 비교 `#81ADA8`. 글로우·그라데이션·짙은 그림자를 없애고 카드 테두리를 최소화했습니다.
- 차트 범주색은 고정 순서 4색(라벤더 `#A49BC8`, 세이지 `#418F86`, 샌드 `#DBAA5E`, 로즈 `#BF6F8B`)과 '기타' 회색입니다. 라벤더와 `#81ADA8`은 명도가 같아 색각 검사에서 구분되지 않아, 채움용 비교색은 같은 계열의 진한 `#418F86`을 씁니다(`#81ADA8`은 회귀선·KDE 같은 선에 사용).
- 한글 가독성을 위해 최소 글자 크기를 13px로 올리고, 제목, 본문, 캡션, 출처의 위계를 나눴습니다.
- 이중 축 차트는 쓰지 않습니다(연간·누적은 별도 차트).
- 모든 차트 카드의 확대 버튼: 확대 차트와 분석 문단, 데이터 표, 출처와 기준, 대응하는 보고서 원본 PNG.
- 접근성: 키보드 포커스, 본문 건너뛰기, 모달 포커스 가두기와 Esc, 차트 aria-label과 표 보기, 히트맵 칸 키보드 탐색, `prefers-reduced-motion`.
- 반응형: 1280px 이하 2열, 960px 이하 1열·슬라이드 메뉴, 560px 이하 필터 2열·카드 헤더 줄바꿈. 560px 이하에서 상세 보기는 전체 화면(닫기 버튼 고정)이며, 박스플롯·점 그래프는 카드 안쪽 폭에 맞춰 그리고 그보다 좁으면 카드 안에서만 가로 스크롤합니다(페이지 가로 스크롤 없음).
- 히트맵 툴팁은 화면 기준(position: fixed)으로 띄워 표의 스크롤 영역에 잘리지 않고, 위 공간이 부족하면 칸 아래로, 좌우 끝에서는 안쪽으로 옮깁니다.
- 산점도 회귀선은 최소제곱 절편·기울기를 바꾸지 않고 그립니다. 절편이 음수이면 y=0이 되는 x에서 시작하고, 축 범위 밖은 잘라 냅니다. 회귀식은 그래프 아래에 표시합니다.
- 빌드: 차트 라이브러리(`vendor-charts`)와 React 계열(`vendor-react`)을 별도 청크로 나눕니다(`vite.config.ts`).

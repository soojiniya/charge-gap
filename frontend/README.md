# CHARGE GAP 프론트엔드

대한민국 전기차 보급 및 충전 인프라 현황 분석 대시보드입니다. React 18, TypeScript, Vite로 만들었습니다.
모든 수치는 기존 Flask 백엔드(`backend/`)의 실제 API 응답에서 가져옵니다. 프론트엔드에 하드코딩한 통계는 없습니다.

## 실행 방법 (Windows PowerShell)

필요한 것: Node.js 24(이번 검증은 24.21.0), 이미 완성된 Flask 백엔드. 패키지의 최소 엔진 범위는 `^20.19.0 || >=22.12.0`이며 실제 운영에서는 보안 지원 중인 버전을 사용하세요. 프로젝트 전체 준비와 데이터 별도 공급은 [상위 README](../README.md)를 확인하세요.

**1. 백엔드 실행** (터미널 1, 기존 방식 그대로)

```powershell
# <프로젝트 폴더> = 이 저장소를 clone한 폴더
Set-Location '<프로젝트 폴더>\backend'
.\.venv\Scripts\python.exe run.py
```

`http://127.0.0.1:5000`에서 CSV를 읽어 들이는 데 수 초가 걸립니다.

**2. 프론트엔드 실행** (터미널 2)

```powershell
Set-Location '<프로젝트 폴더>\frontend'
npm ci
npm run dev
```

브라우저에서 **http://localhost:5173** 을 엽니다.

**3. 카카오맵 키 설정** (지도를 보려면 필요)

```powershell
Copy-Item .env.example .env   # 그다음 .env의 VITE_KAKAO_MAP_KEY= 뒤에 카카오 JavaScript 키를 적습니다
```

카카오 개발자 콘솔에서 카카오맵 사용 설정을 켜고, JavaScript SDK 도메인에 `http://localhost:5173`(배포는 `https://charge-gap.onrender.com`)을 등록해야 합니다. `.env`를 바꾼 뒤에는 `npm run dev`를 다시 시작합니다. 키가 없어도 지도 자리에 안내가 표시될 뿐 나머지 화면은 동작합니다.
Vite 포트는 5173으로 고정했습니다. 백엔드의 기본 CORS 허용 origin(`http://localhost:5173`, `http://127.0.0.1:5173`)과 맞추기 위해서이며, 백엔드 설정을 바꿀 필요가 없습니다.

**배포용 빌드**

```powershell
npm run build      # dist/ 생성 (타입 검사 포함). VITE_API_BASE_URL 필요
npm run preview    # http://localhost:5173 에서 빌드 결과 확인
```

production 빌드는 `VITE_API_BASE_URL`이 비어 있거나 localhost(`127.0.0.1`, `localhost` 등)를 가리키면 실패합니다. 배포 사이트에서 모든 API 요청이 방문자 PC의 localhost로 가는 것을 막기 위해서입니다. 로컬 미리보기용 빌드만 `$env:CHARGE_GAP_ALLOW_LOCAL_API_BUILD='1'; npm run build`처럼 명시적으로 허용합니다. 이 변수는 `VITE_` 접두사가 아니어서 번들에 들어가지 않습니다.

**테스트**: `npm test`는 `tests/*.test.cjs` 29개 파일(170개 테스트: API 주소 검사, API 연결 오류 안내, 서버 절전 복귀 대기, URL 필터 검증, 사이드바 필터 유지, 줄바꿈, 히트맵 통합 요청·출력 해석 회귀, 보안 헤더, 폰트 자산, 지도 클러스터·캔버스 표시층·bbox 경계, 좌표 품질 안내, SPA 직접 URL rewrite 설정, Python 그래프 세트, 지역 격차 히트맵 접근성, 그래프 2·6 비율 소수점 표기 등)를 Node 내장 테스트 러너로 실행합니다. `tests/*.browser.cjs` 18개는 실행 중인 로컬 서버와 Playwright `page`가 필요한 브라우저 회귀 모듈이며, 카카오맵 SDK는 `tests/fixtures/kakao-maps-stub.js`로 대신합니다.

**서버 절전 복귀**: 연결 실패나 JSON이 아닌 응답이 오면 요청마다 오류를 띄우지 않고 `src/api/readiness.ts`의 공용 대기열에서 기다립니다. 상태 확인 요청 하나만 2·4·8초 뒤, 이후 10초마다 최대 3분 보내고, 화면 위에 안내 하나(`src/components/ServerWakeNotice.tsx`)를 보여 줍니다. 서버가 응답하면 현재 화면·필터 그대로 다시 불러오고, 3분이 지나면 '다시 시도'를 안내합니다. 400·404·500처럼 API가 JSON으로 보낸 오류는 기존 카드 오류로 표시합니다.

`dist/`를 다른 주소에서 서비스한다면, 그 origin을 백엔드 실행 전에 `CHARGE_GAP_CORS_ORIGINS`에 추가해야 합니다(API_SPEC.md 참고).
이때 직접 URL 접근·새로고침을 위해 페이지 경로(`/ev-registration`, `/charging-infrastructure`, `/regional-explorer`, `/growth-trends`, `/python-visualization`)가 `index.html`로 가도록 rewrite를 설정해야 합니다. 실제 파일(`/assets/...`, `/python-charts/...`)과 API 경로는 rewrite하지 않습니다. Render 설정은 `../docs/RENDER_DEPLOYMENT.md`의 "직접 URL·새로고침 404" 절을 참고하세요.

**API 주소 변경** (선택): `.env`의 `VITE_API_BASE_URL`을 바꿉니다. 기본값은 `http://127.0.0.1:5000`입니다.

> 지도는 카카오맵 JavaScript SDK를 씁니다. `frontend/.env`(배포는 Render 환경 변수)에 `VITE_KAKAO_MAP_KEY=<카카오 JavaScript 키>`를 넣고, 카카오 개발자 콘솔에 실행 주소(예: `http://localhost:5173`, 배포 도메인)를 등록해야 합니다. JavaScript 키는 빌드 결과에 포함되는 공개 키이므로 등록 도메인 제한으로 보호하며, REST API 키·Admin 키는 넣지 않습니다. 키를 코드에 적지 않으며, 키가 없거나 SDK를 불러오지 못하면 지도 자리에 원인(키 없음·네트워크·시간 초과·초기화 실패)이 안내되고 분석 패널·표·그래프는 그대로 동작합니다. 지도 위 "어둡게/원본"으로 배경 밝기를 바꿀 수 있습니다. Docker Compose 빌드에는 키를 전달하지 않으므로 Compose 화면에서는 지도 대신 안내가 표시됩니다.

## 페이지와 그래프

과제용 그래프 10종의 형태, 데이터, 완료 여부는 **[docs/CHART_PLAN.md](docs/CHART_PLAN.md)**에 정리했습니다.

| 경로 | 페이지 | 그래프 |
|---|---|---|
| `/` | Overview | 기준 시점 띠, KPI 4개, 그래프 9(누적 영역), 6(유형 도넛), 4(산점도+회귀선), 1(지역 막대), 해석 기준, Python Visualization 바로가기 |
| `/ev-registration` | EV Registration | 등록 요약, 그래프 1(가로 막대), 2(차종 가로 롤리팝), 3(사업용·비사업용 100% 누적 가로 막대, 대수 보기 전환), 등록 표 |
| `/charging-infrastructure` | Charging Infrastructure | 요약, 그래프 6(유형 도넛)과 유형 표, 7(히스토그램+KDE), 5(충전소당 충전기 수 박스플롯), 10(운영기관 트리맵), 운영기관 표 |
| `/regional-explorer` | Regional Explorer | 충전소 지도, 두 지역 비교(`cmp_a`·`cmp_b`), 전국 충전 인프라 구성 격차(5개 지표, CSV·PDF 내보내기), 그래프 8(지역×출력 히트맵), 4(산점도), 지역 표, 충전소 목록 |
| `/growth-trends` | Growth Trends | 구간 요약, 연간 설치 막대, 그래프 9(누적 영역), 연도 표 |
| `/python-visualization` | Python Visualization | Python(Matplotlib·Seaborn) 고정 PNG 10개 갤러리(데스크톱 3~4열·태블릿 2열·모바일 1열)와 확대 보기. 정적 파일 `public/python-charts-web/`(웹 그래프 1~10을 Matplotlib·Seaborn으로 구현한 PNG 10개 + `charts.json`), 필터 무관 |

모든 주요 그래프 아래에는 분석 목적, 그래프 선택 이유, 주요 결과, 해석, 주의사항, 데이터 출처·변수가 있습니다.
결과·해석의 수치는 그 그래프가 받은 실제 API 응답으로 계산하며(`src/analysis/insights.tsx`), 필터 반영 여부를 문단 위에 표시합니다.

## 필터와 API 요청변수

필터 상태는 URL 쿼리에 저장됩니다. 사이드바로 페이지를 옮겨도 공통 필터(`region`, `type`, `deletion`, `operator`, `ev_region`)는 유지되고, 링크로 같은 화면을 공유할 수 있습니다. 연도 구간(`from`, `to`)은 Growth Trends 전용이라 다른 페이지로 넘기지 않습니다. 허용 목록에 없는 값(예: `?region=99`, 없는 운영기관 ID)은 무시하고 전국·전체 기준으로 표시하며, 기록을 늘리지 않고 URL에서도 지웁니다. 운영기관 ID는 운영기관 목록을 받은 뒤 확인합니다.

| 화면 필터 | URL | API 요청변수 | 적용 엔드포인트 |
|---|---|---|---|
| 충전기 지역 (16개) | `region` | `region_code` | overview, charger-regions/types/output, operators, locations (charger-output/regions·regional-disparity는 지역 필터를 무시하고 16개 지역 모두 반환) |
| 충전기 유형 (01~11) | `type` | `charger_type` | 〃 + charger-output/regions, locations/grid |
| 삭제 표시 상태 | `deletion` | `deletion` (`all`이면 생략) | 〃 |
| 운영기관 | `operator` | `operator_id` | 〃 |
| 등록 지역 (16개, 2026-09 기준 · 전남광주 포함) | `ev_region` | overview는 `ev_region_code`, ev-registration은 `region_code` | overview, ev-registration |
| 연도 구간 | `from`, `to` | `year_from`, `year_to` | growth |
| 페이지, 표시 개수 | 컴포넌트 상태 | `page`, `limit` | operators, locations |
| (박스플롯) | 위 충전기 필터 | `region_code`, `charger_type`, `operator_id`, `deletion`(전체 선택 시 `not_deleted`) | station-size-distribution |
| 지도 영역 | 지도 이동 | `bbox` (+ 줌 11~15는 `zoom`) | locations, locations/grid |

- 각 차트의 쿼리 키에는 그 엔드포인트가 실제로 받는 요청변수만 들어갑니다. 그래서 충전기 필터를 바꾸면 충전기 차트만 다시 요청되고, 등록·연도 차트는 다시 요청되지 않습니다. 카드 오른쪽 위 태그(`필터 적용` / `필터 무관`)가 이를 표시합니다.
- 차트 막대를 누르면 해당 지역·유형·운영기관으로 필터가 바뀝니다. 같은 막대를 다시 누르면 해제됩니다.
- 지역·유형 선택지는 `/api/overview`의 `meta.filter_options`, 운영기관 선택지는 `/api/operators`(limit=200, `next_page`를 따라 전체)에서 받습니다.
- 지역×출력 히트맵은 `/api/charger-output/regions` 한 번으로 16개 지역을 받고, 그 결과를 지역별 `/api/charger-output` 캐시에도 넣어 분석 패널·두 지역 비교·Charging Infrastructure가 다시 요청하지 않게 합니다.
- 빈 값은 보내지 않습니다. 명세상 빈 값과 중복 변수는 400입니다. 400 응답은 `error.code`, `message`, `parameter`를 그대로 보여 주고 재시도하지 않습니다.

## 지도 동작 (카카오맵)

- 줌 11 미만: `/api/charger-regions`의 시도별 충전소 수로 원을 그립니다. 원 위치는 표시용 대표 지점이며 통계값이 아닙니다.
- 줌 11~15: 현재 화면 `bbox`와 `zoom`으로 `/api/locations/grid`를 요청해, 화면 영역의 **모든** 충전소를 서버에서 격자 칸(화면 약 32px)으로 집계하고, 화면에서 64px 기준으로 다시 묶어 그립니다. 상태 줄에 "화면 영역 N곳 전체 집계"를 표시합니다.
- 줌 16 이상: `/api/locations`를 `bbox`, `limit=1000`으로 요청해 개별 충전소를 그립니다. 3페이지(3,000곳)까지 자동으로 받고 그 뒤는 "다음 1,000곳 불러오기" 버튼으로 이어 받습니다.
- 처음 보기: URL에 지역 필터(`?region=`)가 있으면 그 지역 대표 지점(줌 9), 없으면 전국 보기(줌 8). 사용자가 지도를 직접 움직이기 전에는 지역 필터를 바꾸면 그 지역으로 다시 맞추고, 움직인 뒤에는 위치를 바꾸지 않습니다.
- 점 색: 비삭제 충전기가 있는 충전소는 채운 녹색, 모두 삭제 표시인 충전소는 흰 채움·녹색 테두리. 점 크기는 필터와 일치하는 충전기 수입니다.
- 충전소를 누르면 지도 정보창(이름·주소·일치 충전기·비삭제/삭제 표시·ID)과 오른쪽 분석 패널의 "선택한 충전소"에 같은 값이 표시됩니다. 지역을 바꾸는 동안 패널은 이전 지역 수치 대신 불러오는 중 표시를 보여 줍니다.
- 요청하는 `bbox`는 화면보다 작아지지 않도록 바깥쪽으로 소수 5자리에 맞춥니다(`components/geo/bbox.ts`). 표시는 지도 위 캔버스 한 장(`components/geo/MarkCanvasLayer.ts`)에 그립니다.
- 지도 좌표는 원본 API 값을 그대로 씁니다. 일부 충전소는 원본 좌표가 주소와 다른 곳(대체 좌표 포함)에 있어 실제와 다른 위치에 보일 수 있습니다. 지역 집계는 좌표가 아닌 지역 코드로 계산하므로 영향을 받지 않습니다.
- 서버가 좌표 품질을 의심한 충전소(응답의 선택 필드 `coordinate_flag`, 2026-10-15 스냅샷 644곳)를 고르면 정보창과 "선택한 충전소" 패널의 주소 아래에 안내 한 줄이 나옵니다(`components/geo/CoordinateNote.tsx`, 문구는 `lib/coordinateQuality.ts`). 정상 충전소에는 나오지 않으며, 지도 점의 위치·색·모양과 묶음·집계는 바꾸지 않습니다. 같은 위치 묶음 목록에는 표시하지 않습니다.

## 데이터 정확성 원칙 (API_SPEC 준수)

- 전기차 등록(2026년 9월 말, 1,191,873대)과 충전기(2026-10-15 조회, 527,433기, 101,091곳)는 기준 시점이 달라 서로 나누지 않습니다. 충전기 1기당 차량 수나 충전 부족률은 어디에도 계산하지 않습니다.
- 지역 체계: 등록자료(2026-09)와 충전기 자료 모두 2026년 16개 지역(12 전남광주통합특별시)을 씁니다. 광주·전남으로 임의 분리하지 않습니다. 이전 등록자료(2025-12, 17개 시도)로 그린 보존용 PNG 1~3번만 광주·전남이 따로 표시됩니다.
- 비삭제 표시는 "이용 가능"이 아니라는 API 경고를 그대로 표시합니다.
- 출력 차트는 `positive_numeric`만 막대로 그리고 결측·무효 값은 따로 셉니다. 통계는 `meta.output_statistics`를 그대로 씁니다.
- 연도 통계의 누적값은 원본 그대로 쓰며, 2026년은 부분 연도로 빗금과 점선으로 구분합니다.
- 기존 PNG 10종은 `/api/charts` 메타데이터와 `/api/charts/{id}/image`로 표시하며, 필터가 적용되지 않는 고정 이미지라고 표시합니다.

## 파일 구조

```text
frontend/
  index.html
  package.json            # 버전 고정
  vite.config.ts          # 포트 5173 고정, 공통 라이브러리 청크 분리, production API 주소 검사
  tsconfig.json
  .env.example            # VITE_API_BASE_URL, VITE_KAKAO_MAP_KEY(빈 값 — 실제 키는 .env에만)
  public/favicon.svg
  public/python-charts-web/ # Python 그래프 PNG 10개 + charts.json (최종, scripts/create_web_matched_charts_2026.py → build_python_charts_web_page.py)
  public/python-charts/   # 다크 테마 Python PNG 10개 + charts.json (보관, scripts/create_python_charts_2026.py 결과)
  docs/CHART_PLAN.md      # 그래프 10종 지원 현황, 미완료 API 명세, 백엔드 작업 목록
  src/
    main.tsx              # QueryClient, Router, 폰트, 전역 CSS
    App.tsx               # 라우트 (Overview 외 페이지는 지연 로딩)
    api/
      client.ts           # fetch, ApiError, URL 생성(빈 값 제외), HTTP 상태와 error 우선 확인
      readiness.ts        # 서버 절전 복귀 대기열
      pythonCharts.ts     # Python 그래프 charts.json 읽기 (화면은 public/python-charts-web/)
      endpoints.ts        # 13개 엔드포인트 함수, 요청변수 매핑, bbox 직렬화
      hooks.ts            # TanStack Query 훅 (엔드포인트별 쿼리 키)
      types.ts            # API_SPEC/openapi.json 기반 응답 타입
    config/apiBaseUrl.ts  # production 빌드 API 주소 검사(vite.config.ts에서만 사용)
    state/filters.ts      # URL 동기화 필터 상태
    analysis/             # insights.tsx(그래프별 분석 문단), keyFindings·regionCompare·disparity(분석 계산), dataSources·sourceParts(출처 표기)
    features/             # ChartCards(그래프 10종 + 연간 설치), KeyFindings, RegionCompare, RegionalDisparity + disparityExport(CSV·PDF)
    lib/stats.ts          # 상관·회귀·가중 히스토그램·KDE
    lib/format.ts         # 숫자, 백분율, 단위 표기
    charts/               # 재사용 차트 (Recharts)
      HBarChart.tsx  StackedHBar.tsx  ColumnChart.tsx  DonutChart.tsx  CumulativeChart.tsx
      RegionScatter.tsx  HistKde.tsx  Heatmap.tsx  OperatorTreemap.tsx  BoxPlot.tsx  CommercialDotPlot.tsx
      Tooltip.tsx  theme.ts
    components/
      layout/AppShell.tsx # 사이드바, 모바일 메뉴, 페이지 헤더(기준 시점 레일)
      FilterBar.tsx       # 지역, 유형, 삭제 표시, 운영기관, 등록 지역
      StationMap.tsx      # 카카오맵 지도 (시도 원, 줌 11~15 격자 묶음, 줌 16 이상 개별 충전소, 정보창)
      MapAnalysisPanel.tsx # 지도 오른쪽 분석 패널 (선택 지역·충전소 요약)
      geo/                # kakaoLoader.ts(SDK 로더), kakao.ts(타입·좌표 변환), MarkCanvasLayer.ts(캔버스 표시층),
                          # cluster.ts(화면 묶음), bbox.ts(바깥쪽 맞춤 bbox)
      ServerWakeNotice.tsx # 서버 절전 복귀 안내
      ReportGallery.tsx   # Python 데이터 시각화 그래프 갤러리(PythonChartGallery)
      DataNotes.tsx       # 지역 체계, 비율 미계산 안내
      ui/                 # Card, Insight(분석 문단), ChartDetail(상세 보기), PythonChartView(Python 그래프 확대 보기), Modal, DataTable, Pager,
                          # QueryState(로딩/빈 결과/오류), OperatorPicker, Icon
    pages/                # 6개 페이지 (PythonVisualization.tsx 포함)
    styles/tokens.css     # 색, 글꼴, 반경 토큰
    styles/global.css     # 레이아웃, 컴포넌트, 반응형
```

## 디자인 메모 (v3, Dark Monochrome)

- 블랙·차콜·그레이·화이트만 씁니다. 배경 `#111111`, 사이드바 `#171717`, 카드 `#222222`, 카드 hover `#2D2D2D`, 테두리 `#383838`, 주요 텍스트 `#F5F5F5`, 보조 텍스트 `#A3A3A3`, 비활성 `#737373`, 주요 버튼 `#E5E5E5`(글자 `#171717`), 선택된 필터 `#D4D4D4`. 유채색 포인트·글로우·장식용 그라데이션은 쓰지 않습니다. 토큰은 `styles/tokens.css`(기존 이름 `--point`·`--compare`·`--s1`… 유지, 값만 무채색), 차트 색은 `charts/theme.ts`.
- 단일 포인트 색 `#C7D8CF`(저채도 세이지 그레이, `--accent` / `C.accent`)만 제한적으로 씁니다: Overview 핵심 KPI 2개(전기차 등록·충전기), 주요 분석 발견의 최댓값·강조 지역, 그래프 1의 최댓값 막대, 선택한 지역·기관(막대·산점도 점·트리맵 칸·지도 선택 링·표 선택 행). 일반 텍스트·테두리·사이드바·배경·필터 버튼은 무채색 그대로입니다.
- 시각적 위계(v3.2): 배경 `#0E0E0E` → 카드 `#222222` → 기본 데이터 회색 → 1위·선택 데이터 세이지 순으로 명도 단계를 둡니다. KPI는 라벨을 작은 캡션으로 낮추고 숫자를 2.5rem·700으로 키웠습니다(4열에서는 폭에 맞춰 축소). '주요 분석 결과'는 회색 면 대신 얇은 세로선과 큰 굵은 수치로 표시합니다. 그래프 10은 1위 세이지·2·3위 밝은 회색과 순위 배지·4위 이하 어두운 회색 단계이며 면적은 그대로입니다. 그래프 8 히트맵은 값을 지각 명도 L* 20→96에 균등 대응시키고 열 안 상위 값(t ≥ 0.8)은 굵은 숫자로 표시합니다.
- 차트는 7단계 회색(`#F5F5F5` `#D4D4D4` `#A3A3A3` `#737373` `#525252` `#404040` `#303030`)만 씁니다. 범주 순서는 `#A3A3A3` → `#525252` → `#F5F5F5` → `#737373`, '기타'는 `#404040`이며 도넛 이웃 조각의 명도 차는 대부분 L* 20 이상입니다. 명도만으로 부족한 곳은 조각 사이 2px 카드색 간격·직접 레이블·점선(회귀선·KDE·기준선)·빗금(부분 연도, 전국보다 낮음)으로 함께 구분합니다.
- 히트맵은 어두운 회색 → 흰색 연속 명도 스케일이며, 밝은 칸은 검정 글씨, 어두운 칸은 흰 글씨입니다. 지역 격차 히트맵은 전국보다 높음 = 밝은 단색, 낮음 = 회색 + 빗금이고 칸에 +/− 부호를 함께 씁니다.
- 지도 '어둡게'는 카카오 지도 위에 반투명 어두운 막을 얹어 밝기만 낮추고(지도 원본·색 구분은 그대로), '원본'은 원래 지도 그대로입니다.
- Python Visualization 페이지의 PNG 10종은 분석 스크립트가 만든 고정 이미지라 이번 리디자인에서 바꾸지 않았습니다.
- 한글 가독성을 위해 최소 글자 크기를 13px로 올리고, 제목, 본문, 캡션, 출처의 위계를 나눴습니다.
- 이중 축 차트는 쓰지 않습니다(연간·누적은 별도 차트).
- 모든 차트 카드의 확대 버튼: 확대 차트와 분석 문단, 데이터 표, 출처와 기준, 대응하는 Python 그래프(Python Visualization 페이지와 같은 `public/python-charts-web/`).
- 접근성: 키보드 포커스, 본문 건너뛰기, 모달 포커스 가두기와 Esc, 차트 aria-label과 표 보기, 히트맵 칸 키보드 탐색, `prefers-reduced-motion`.
- 반응형: 1280px 이하 2열, 960px 이하 1열·슬라이드 메뉴, 560px 이하 필터 2열·카드 헤더 줄바꿈. 560px 이하에서 상세 보기는 전체 화면(닫기 버튼 고정)이며, 박스플롯·점 그래프는 카드 안쪽 폭에 맞춰 그리고 그보다 좁으면 카드 안에서만 가로 스크롤합니다(페이지 가로 스크롤 없음).
- 히트맵 툴팁은 화면 기준(position: fixed)으로 띄워 표의 스크롤 영역에 잘리지 않고, 위 공간이 부족하면 칸 아래로, 좌우 끝에서는 안쪽으로 옮깁니다.
- 산점도 회귀선은 최소제곱 절편·기울기를 바꾸지 않고 그립니다. 절편이 음수이면 y=0이 되는 x에서 시작하고, 축 범위 밖은 잘라 냅니다. 회귀식은 그래프 아래에 표시합니다.
- 빌드: 차트 라이브러리(`vendor-charts`)와 React 계열(`vendor-react`)을 별도 청크로 나눕니다(`vite.config.ts`).

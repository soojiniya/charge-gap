# CHARGE GAP

## 프로젝트 배포 현황
CHARGE GAP은 대한민국 전기차 보급 현황과 충전 인프라를 분석하는 데이터 시각화 웹 대시보드입니다.

소스 코드는 GitHub에서 관리하며, Render 배포 설정(`render.yaml`, `deploy/render/`)이 준비되어 있습니다.

배포 주소: https://charge-gap.onrender.com (Render Static Site), API: https://charge-gap-api.onrender.com (Render Docker Web Service).

**2026-11-04 실제 접속 확인(읽기 전용):** 공개 주소에서 5개 페이지가 열리고 직접 URL(`/regional-explorer` 등) 접근이 200으로 응답하며, 화면이 위 API에 연결되어 데이터가 표시되고, 정적 사이트 보안 헤더(CSP·X-Frame-Options·Referrer-Policy·X-Content-Type-Options)가 전송되는 것을 확인했습니다. Render 대시보드 설정(서비스 생성 방식, 환경변수, 배포된 커밋)은 저장소 밖이라 확인하지 않았습니다. 무료 플랜이라 유휴 후 첫 접속은 서버 기동으로 지연될 수 있습니다. 공개 접속이 가능하다는 사실이 아래 [데이터 공개 조건](#공개-조건-확인-필요)의 확정을 뜻하지는 않습니다.

**2026-11-05 공개 주소 확인(읽기 전용):**
- **백엔드 API(커밋 `eea94cd` 배포):** 지역 격차 분석 `/api/regional-disparity`가 공개 API에서 응답합니다(16개 지역). 데이터 기준(전기차 2026-09, 충전기 2026-10-15)과 건수(전기차 1,191,873대, 충전기 527,433기, 충전소 101,091곳, 삭제 표시 4,121기)는 로컬과 같습니다.
- **프론트엔드:** 공개 사이트는 아직 이전 빌드(사이드바 5개 페이지)이며, 현재 작업 트리의 프론트엔드 변경(**Python Visualization 페이지**, 지역 격차 화면·CSV/PDF 내보내기 개선 등)은 **아직 배포되지 않았습니다**(공개 주소의 `/python-visualization`은 404). 이 변경은 로컬에서 검증했습니다. 배포 순서는 [공개 배포 준비 안내](docs/RENDER_DEPLOYMENT.md#프론트엔드-갱신-배포-순서)를 따릅니다.

전기차 등록 데이터: 2026년 9월 기준

충전기 데이터: 2026년 10월 15일 조회 기준

주요 기술: Python, Pandas, Matplotlib, Seaborn, React, TypeScript, Flask, Docker

주요 기능: 전기차 등록 현황 및 충전 인프라 시각화, 두 지역 비교, 16개 시도 충전 인프라 구성 격차 분석(5개 지표), 충전기 유형·삭제 표시·운영기관별 필터링, 그래프별 분석 결과, 격차 분석 CSV·PDF 보고서 내보내기

웹사이트는 총 6개 페이지(분석 페이지 5개 + Python 데이터 시각화 페이지 1개)로 구성되어 있으며, 다양한 그래프와 지도 기반 시각화를 제공합니다.

※ Render 무료 서버로 배포하면 일정 시간 접속이 없을 때 서버가 절전 상태로 전환되어 최초 접속 시 데이터 로딩에 시간이 걸릴 수 있습니다.

## 주요 기능과 기술

- **Overview / EV Registration / Charging Infrastructure / Regional Explorer / Growth Trends / Python Visualization**의 6개 페이지.
- 지역·충전기 유형·삭제 표시·운영기관 필터, URL 쿼리 기반 필터, 초기화·데이터 표·페이지네이션.
- 실제 API 기반 분석 설명, 툴팁·그래프 확대·애니메이션, 충전소 bbox 지도 조회.
- Regional Explorer의 두 지역 비교: 전기차 등록(2026-09)과 충전 인프라(2026-10-15)를 각각 같은 기준일 자료끼리 비교(차이·%p·배수·순위). 등록 대수와 충전기 수를 서로 나눈 지표는 만들지 않습니다.
- Regional Explorer의 전국 충전 인프라 구성 격차: 16개 시도를 5개 지표(100kW 이상 비중, 충전소당 평균 충전기, 충전기 유형별 구성, 운영기관 집중도 HHI, 삭제 표시 비중)로 비교. 전국 기준값(전국 분자·분모 합산)·16개 지역 순위·막대그래프·히트맵·선택 지역 요약 문장·계산 근거 패널, 지표 선택의 URL 저장. 공급 구성 지표이며 충전 수요나 부족률을 계산하지 않습니다.
- 격차 분석 내보내기: 현재 지표·필터의 16개 지역 표를 **CSV**(UTF-8 BOM, Excel 한글 호환)로 저장하고, A4 3페이지 **PDF 보고서**(핵심 요약 · 16개 지역 비교 · 계산 방법·주의사항·출처)를 브라우저 인쇄로 저장.
- Flask 조회 API **12개 경로**(JSON 11개 + 그래프 PNG 1개), 박스플롯 집계·지역 격차 지표·위치 조회 제한·요청 검증·JSON 오류 처리. 명세: [API_SPEC.md](backend/API_SPEC.md), [openapi.json](backend/openapi.json).
- Python: Pandas·NumPy·Matplotlib·Seaborn / 웹: React·TypeScript·Vite·Recharts·Leaflet / 실행: Waitress·Nginx·Docker Compose.

**Python Visualization 페이지**(`/python-visualization`, 사이드바 「Python 데이터 시각화」)는 `scripts/create_python_charts_2026.py`가 만든 `frontend/public/python-charts/`의 고정 PNG 10개를 항상 표시합니다(데스크톱 3~4열, 태블릿 2열, 모바일 1열). 그래프를 누르면 확대 이미지와 데이터 출처·기준일·지역 체계·삭제 기준·시각화 기법·사용 라이브러리, 주요 분석 결과, 해석 주의를 볼 수 있습니다. 메타데이터는 같은 폴더의 `charts.json`에 있으며, 웹사이트 필터와 무관한 고정 이미지입니다. Overview에는 이 페이지로 가는 바로가기만 둡니다. 이 PNG는 프론트엔드 정적 파일(`/python-charts/…`)이고, 백엔드 `/api/charts`가 제공하는 보존용 PNG 10개(`outputs/charts/`)와는 별도 자료입니다. 이 페이지는 아직 공개 사이트에 배포되지 않았습니다.

## 주요 그래프 10개

| # | 그래프 | 표현 |
|---|---|---|
| 1 | 지역별 전기차 등록 대수 | 가로 막대 |
| 2 | 차종별 전기차 등록 구성 | 도넛 |
| 3 | 사업용·비사업용 구성 | 비율 점, 100% 누적·대수 보기 전환 |
| 4 | 지역별 충전소 수와 충전기 수 관계 | 산점도·회귀선 |
| 5 | 충전소당 충전기 수 분포 | 지역별 박스플롯 |
| 6 | 충전기 유형별 구성 | 도넛 |
| 7 | 충전기 정격 출력 분포 | 로그 축 히스토그램·KDE |
| 8 | 지역별 출력 구간 구성 | 비율 히트맵 |
| 9 | 연도별 누적 설치 추이 | 누적 영역 |
| 10 | 운영기관별 충전기 규모 | 트리맵 |

연간 설치량 막대와 충전소 지도도 제공합니다. 웹 그래프와 Python PNG는 별개 결과물이며, 비교할 때 삭제 표시 등 집계 조건을 맞춰야 합니다. [그래프 구성·API 연결](frontend/docs/CHART_PLAN.md), [Python 그래프 분석](reports/chart_analysis.md)을 참고하세요.

## 데이터 출처와 해석 기준

| 자료 | 제공기관 · 작성기관, 자료명 | 자료 기준 · 수집 시점 · 이용 조건 |
|---|---|---|
| 전기차 등록 | [국토교통부 통계누리](https://stat.molit.go.kr/portal/cate/statMetaView.do?hFormId=1244&hRsId=58) · 작성기관 국토교통부, 「2026년 09월 자동차 등록자료 통계」 10.연료별_등록현황 (자동차등록현황보고) | 2026년 9월 말 등록 기준, 파일 저장 2026-10-20. 순수 전기차 1,191,873대, 전남광주 포함 16개 지역. **이용 조건 확인 중** (통계누리 저작권보호정책에 따라 출처 표시). 기존 2025-12 원본·고정 PNG 1~3번(17개 시도)은 기록으로 보존 |
| 충전기·충전소 | 한국환경공단 ([공공데이터포털](https://www.data.go.kr/data/15076352/openapi.do)), 「전기자동차 충전소 정보」 getChargerInfo | 2026-10-15 조회(04:16–04:19 KST), 충전기 527,433기·고유 충전소 101,091곳, 16개 지역. **공공누리 제1유형(출처표시)** — 포털 이용허락범위에 명시 |
| 연도별 설치 | [무공해차 통합누리집](https://ev.or.kr/nportal/stats/statsDashboard.do) 데이터·통계 「충전기 설치 성장 추세」, 작성기관 원본 미기재 | 2011–2026, 2026년은 부분 연도. 집계 마감일 원본 미기재(당시 공식 화면 갱신 표시 2026-09-30), 파일 저장 2026-10-15. **이용 조건 확인 중.** 공식 화면은 이후 2026-10-31 갱신에서 과거 연도 수치까지 수정했으며(사유 미확인), 이 프로젝트는 당시 자료를 유지하므로 2026년 누적 540,210기 등은 현재 공식 최신값이 아님 |
| 참고용 지역 출력 통계 | `우리 지역 급속 충전 여건_2026-10-15.xlsx` | 원본 대조·분석용. 웹 출력 히트맵은 API 집계 사용. 기준일·공개 조건 추가 확인 필요 |

전기차 등록(2026-09)과 충전기(2026-10-15)는 **16개 지역이 대응하지만 기준 시점이 다릅니다.** 서로 다른 시점으로 부족률을 계산하거나 현재 스냅샷을 2025년 12월 현황으로 해석하지 않습니다. 전남광주통합특별시를 광주·전남으로 임의 분리하지 않습니다. 삭제 표시 4,121기·비삭제 523,312기를 구분하고, 비삭제를 실제 이용 가능 상태로 해석하지 않습니다. `statUpdDt`는 상태 갱신일시이며 설치일이 아닙니다.

### 공개 조건: 확인 필요

API 포털에는 확인 시점에 공공누리 제1유형 출처표시 조건이 안내됐으나, 이것으로 Excel·파생 CSV·PNG·보고서 전체의 재배포 권리를 일괄 확정하지 않습니다. 각 원본의 이용 조건·제3자 권리·출처와 가공 사실 표기를 검토해야 합니다. **CSV·Excel의 공개 여부, 별도 데이터 제공 URL, 전달 방식과 담당자는 모두 미확정**입니다. 코드 공개 라이선스도 소유자가 별도 결정해야 합니다. 후보에 남은 PNG·보고서도 최종 권리·내용 검토 대상입니다. 격차 분석 CSV에는 이용 조건이 확인된 충전기 API 자료의 집계값만 들어가며, PDF 보고서는 전기차 등록 자료를 결합하지 않고 참고 출처로만 표기합니다. 전기차 등록·연도별 설치 자료의 **이용 조건은 아직 미확인**입니다.

## 별도 데이터 준비: 실행 필수

승인된 기존 스냅샷을 다음 경로에 배치하세요. 데이터를 다시 수집할 필요는 없습니다.

| 경로 | 용도 | Git 후보 여부 |
|---|---|---|
| `data/processed/charger_info_clean.csv` | 전체 충전기, 약 240 MB | 제외·별도 준비 필수 |
| `data/processed/ev_registration_by_region_2026_09.csv` | EV 등록 통계 | 제외·별도 준비 필수 |
| `data/processed/charger_installation_trend.csv` | 연간·누적 설치 통계 | 제외·별도 준비 필수 |
| `reports/chart_verification.json` | PNG 메타데이터 | 포함 후보 |
| `outputs/charts/` 기존 PNG 10개 | 웹 PNG 조회 | 포함 후보 |

소스 전달 후 `data/processed/`가 없다면 생성하고 CSV 3개를 넣습니다. 파일명·기준일·SHA256을 함께 확인하세요. 원본 Excel·원본 CSV·다른 집계 CSV는 기본 대시보드 실행에는 필요하지 않으나, 테스트·추가 분석에는 더 필요할 수 있습니다. 데이터 없이 Compose를 시작하면 실패하며 빈 폴더나 가짜 데이터를 대신 만들지 않습니다.

## Docker Compose: localhost:18080

Linux 컨테이너 모드의 Docker Desktop 또는 Docker Engine과 Compose v2가 필요합니다. Windows는 Docker Desktop/WSL 2를 먼저 시작하고 위 파일·PNG 폴더를 준비하세요. 초기 빌드와 지도 배경 타일에는 인터넷이 필요합니다. 대용량 CSV를 메모리에 읽으므로 Docker에 충분한 메모리를 할당해야 합니다.

프로젝트 최상위 폴더에서 실행합니다.

```sh
docker compose config --quiet
docker compose build
docker compose up -d --wait --wait-timeout 240
docker compose ps
```

접속: **http://localhost:18080**

```sh
curl http://localhost:18080/backend/api/overview
curl http://localhost:18080/backend/api/station-size-distribution
docker compose logs --tail=50 backend frontend
```

종료:

```sh
docker compose down
```

`down`은 호스트 CSV·PNG를 삭제하지 않습니다. 소스 변경 후에는 `docker compose up -d --build --wait --wait-timeout 240`로 재빌드합니다. 18080이 사용 중이면 `compose.yaml`의 `127.0.0.1:18080:80`에서 호스트 포트만 변경하세요. 상대 API 경로라 포트 변경만으로 프론트엔드를 재빌드할 필요는 없습니다.

실행 구조는 `브라우저 :18080 → Nginx → /backend/ 프록시 → Waitress :5000`입니다. React production build를 제공하고 Flask 개발 서버는 사용하지 않습니다. backend 포트는 호스트에 공개하지 않습니다. CSV 3개·메타데이터·PNG는 읽기 전용 바인드 마운트로 공급하며 이미지에는 복사하지 않습니다.

공개 빌드 설정은 `VITE_API_BASE_URL=/backend`입니다. 빈 값은 기존 localhost:5000 fallback을 선택하므로 사용하지 않습니다. 브라우저는 동일 origin으로 연결하고 컨테이너의 추가 CORS 허용 목록은 비워 둡니다. 기존 개발 CORS 기본값은 유지합니다. Compose에는 인증키 참조나 `env_file`이 없습니다. `.env`·인증키를 컨테이너·빌드 인수·`VITE_*`에 전달하지 마세요. Compose의 `.env` 보간은 컨테이너에 환경변수를 자동 전달하는 기능이 아닙니다.

**사용자 확인 결과(2026-10-17 전달):** 이미지 2개 빌드 성공, backend·frontend Healthy, 18080 접속, 실제 KPI·그래프·필터·지도 정상 표시, `docker compose down` 정상 종료. 이번 GitHub 준비 단계에서 Docker를 재실행하거나 새 로그·이미지 digest를 수집한 것은 아닙니다. [Docker 검증 기록](docker/VALIDATION.md)을 참고하세요.

## Python·Node 개발 실행

검증 환경은 Python 3.12·Node.js 24입니다. 먼저 CSV를 준비하세요. 조회 백엔드는 수집용 `.env`를 읽지 않습니다.

Windows PowerShell, 프로젝트 최상위 폴더에서:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe run.py
```

다른 터미널에서 프로젝트 최상위 폴더부터:

```powershell
cd frontend
npm ci
npm run dev
```

개발 웹은 `http://localhost:5173`, API는 `http://127.0.0.1:5000`입니다. Linux/macOS는 backend에서 `python3 -m venv .venv`, `.venv/bin/python -m pip install -r requirements.lock.txt`, `.venv/bin/python run.py`를 사용하고, 다른 터미널의 frontend에서 `npm ci`·`npm run dev`를 실행합니다. 호스트 새 OS 설치와 Python PNG 재생성용 Windows 폰트 경로는 별도 확인 대상입니다.

### 테스트 실행 방법

데이터 파일(위 CSV 3개, `reports/chart_verification.json`, PNG 10개)이 있어야 백엔드 테스트가 실행됩니다. 2026-11-05 로컬 재검증 결과를 함께 적습니다.

| 대상 | 실행 위치·명령 | 2026-11-05 결과 |
|---|---|---|
| 백엔드 API·Render 기동 스크립트 | 프로젝트 루트, backend venv Python으로 `python -m pytest backend/tests deploy/render/tests -q` | 204 passed (캐시·지역 격차·출처 테스트 포함) |
| 데이터 수집기 | 프로젝트 루트, 루트 `requirements.lock.txt`를 설치한 Python으로 `python -m unittest test_collector -v` | 12 passed |
| 프론트엔드 단위·회귀 | `frontend`에서 `npm test` (Node 내장 테스트 러너, 추가 의존성 없음) | 122개 중 121개 통과, 1개 건너뜀 (줄바꿈 검사는 Git 저장소 안에서만 실행되며 Windows 저장소에서 통과) |
| 프론트엔드 타입·빌드 | `frontend`에서 `npm run typecheck`, `npm run build` | 통과 (외부 HTTPS API 주소 지정) |

`npm run build`는 production 빌드라서 `VITE_API_BASE_URL`이 비어 있거나 localhost를 가리키면 **빌드가 실패**합니다. 배포용으로는 실제 백엔드 HTTPS origin(또는 Compose의 `/backend`)을 지정합니다. 로컬 미리보기용 빌드만 `CHARGE_GAP_ALLOW_LOCAL_API_BUILD=1`을 함께 지정합니다(PowerShell: `$env:CHARGE_GAP_ALLOW_LOCAL_API_BUILD='1'; npm run build`).

브라우저 회귀 테스트 `frontend/tests/keyboard.browser.cjs`·`navigation.browser.cjs`·`url-filters.browser.cjs`·`api-errors.browser.cjs`·`region-compare.browser.cjs`(두 지역 비교)·`regional-disparity.browser.cjs`(지역 격차 16개 지역×5개 지표 문장·URL 상태·범례)·`disparity-report.browser.cjs`(PDF 보고서 A4 3페이지, 이 테스트에서는 `page.route()`를 쓰지 말 것)·`map-explorer.browser.cjs`(지도 확대·bbox)·`card-layout.browser.cjs`·`direct-url.browser.cjs`·`server-wake.browser.cjs`(서버 절전 복귀, 실제 시간 약 3.5분)는 Playwright `page`를 받는 모듈입니다. 로컬 백엔드·프론트엔드를 실행한 뒤 별도 Playwright 스크립트에서 `await require('./frontend/tests/navigation.browser.cjs')(page, 'http://127.0.0.1:5173')`처럼 호출합니다. Playwright는 프로젝트 의존성에 포함하지 않았습니다. 기존 폰트 자산 경고는 유지되며, 실제 공개 호스팅의 HTTPS·CORS는 별도 실접속 검증 대상입니다. 2026-10-19 배포 준비 기록: [최종 GitHub·Render 준비 결과와 전체 파일 목록](reports/github_render_final_readiness_2026-10-19.md).

## 무료 인터넷 배포 준비

이 절은 2026-10-19 배포 준비 시점의 기록입니다. 이후 Render 서비스가 생성되어 2026-11-04 기준 공개 주소로 접속·동작하는 것을 확인했습니다(상단 [프로젝트 배포 현황](#프로젝트-배포-현황) 참고). 서비스 설정 자체는 Render 대시보드에서 확인하세요.

구조는 **Render Static Site(React) + Free Docker Web Service(Flask) + 승인된 private S3 호환 저장소**입니다. 로컬 Compose/18080 설정과 분리해 `render.yaml`, `deploy/render/Dockerfile` 및 시작 시 검증 다운로드를 준비했습니다. CSV·메타데이터·기존 PNG 10개 총 14파일(231.287MiB)은 이미지에 포함하지 않습니다.

백엔드는 Render의 PORT로 0.0.0.0에 bind하고 Waitress/수치 라이브러리 스레드를 1로 제한합니다. 프론트엔드 `VITE_API_BASE_URL`에는 백엔드의 실제 HTTPS origin을(비어 있거나 localhost이면 빌드 실패), 백엔드 `CHARGE_GAP_CORS_ORIGINS`에는 프론트엔드의 정확한 HTTPS origin을 넣습니다. React Router 직접 URL 접근·새로고침은 Static Site의 페이지 경로 rewrite(`/ev-registration`, `/charging-infrastructure`, `/regional-explorer`, `/growth-trends`, `/python-visualization` → `/index.html`)로 지원합니다. `/python-charts/*.png`·`charts.json`은 빌드 결과(`dist/python-charts/`)에 실제 파일로 있으므로 rewrite 대상이 아닙니다. Blueprint로 관리하지 않고 대시보드에서 만든 Static Site에는 `render.yaml` 규칙이 자동 적용되지 않으므로 대시보드 Redirects/Rewrites에 같은 규칙을 넣어야 합니다([설정 방법](docs/RENDER_DEPLOYMENT.md#직접-url새로고침-404-spa-rewrite)). private 저장소 endpoint·read credentials는 Render 환경 설정에만 넣고 VITE_*나 코드에 넣지 않습니다.

2026-10-19 실제 비공개 R2 다운로드 포함 Linux 시험에서 14개 파일의 크기·SHA-256, API 96/96, 메모리 512MiB·CPU 0.1 제한을 통과했습니다. 최고 메모리는 426.18MiB로 약 85.82MiB의 여유를 확보했고 메모리 제한 이벤트·OOM·재시작은 0회였습니다. 서버 준비 시간은 약 74초였습니다. 다운로드·해시 검증·CSV 파싱의 파일 캐시 반환 최적화를 Render Dockerfile이 복사하는 백엔드 코드에 반영했습니다. [측정 근거](reports/r2_cache_memory_optimization_2026-10-19.md).

R2 private 버킷에 14개 파일 업로드·검증과 읽기 전용 자격증명 교체는 완료됐습니다. 현재 객체는 버킷 루트의 manifest 상대 경로에 있으므로 `CHARGE_GAP_S3_PREFIX`는 **비워 둡니다**. 실제 비밀값은 Render 서버 환경 설정에만 입력합니다. R2는 종량제이며 계정 전체 무료 사용량 안에서 월 $0를 예상하되 무제한 무료를 보장하지 않습니다. Render Free의 유휴 종료 후에는 재다운로드·초기화 지연이 있습니다.

EV 자료의 공식 첨부 목록과 통계누리 이용정책, 충전기 설치 추이의 공식 대응 표를 확인했습니다. 개별 파일·표에 적용되는 공개 이용 조건의 최종 확인은 **아직 남아 있습니다(미확인).** 사이트는 이미 공개 접속이 가능한 상태이지만, 데이터와 파생 그래프·보고서의 공개 이용 허락이 확정된 것은 아닙니다. [출처·이용 조건 확인 기록](docs/DATA_SOURCE_RIGHTS.md).

2026-10-19 기록 시점에는 Render 서비스 생성 전이었고, 2026-11-04에는 정적 사이트와 API가 공개 주소에서 응답하는 것을 확인했습니다. 실제 환경변수·실행 방법·단계별 사용자 작업은 [공개 배포 준비 안내](docs/RENDER_DEPLOYMENT.md)를 참고하세요. GitHub에는 CSV·Excel·자격증명을 올리지 않으며, clone만으로 데이터가 제공되지는 않습니다. 로컬 실행에는 별도 승인된 데이터 공급이, Render 실행에는 비공개 R2 읽기 권한이 필요합니다.

## 구조와 공개 준비

```text
backend/                  Flask API·테스트·명세·Dockerfile
frontend/                 React·그래프·지도·Nginx·Dockerfile
data/                     로컬 CSV·Excel (Git 제외)
outputs/charts/           기존 PNG 10개
outputs/charts_v2_report/ 추가 PNG 10개
reports/                  분석·품질·차트·검증 문서
scripts/                  Python 그래프 생성 코드
docker/                   Docker 실행 검증 문서
docs/                     GitHub 공개 후보·제외 목록
compose.yaml              로컬 전체 실행, 포트 18080
```

Git은 초기화되어 Private 저장소 업로드 이력이 있습니다. 로컬에 커밋되지 않은 변경이 있을 수 있으므로 공개 전 `git status`로 확인하세요. `.gitignore`는 `.env`·인증키 파일·가상환경·node_modules·캐시·로그·임시 파일과 **모든 CSV·Excel**을 제외합니다. `.env.example`은 비밀값 없는 공개 설정 예시만 허용합니다. 로컬 `.dockerignore`는 유지하고 Render 빌드는 전용 Dockerfile.dockerignore로 제한합니다.

후보 목록은 공개 권리 승인이나 실제 staging 목록이 아닙니다. 향후 staging 시 파일 목록과 비밀정보를 다시 검사해야 합니다. 이미 추적된 파일은 `.gitignore`만으로 제외되지 않습니다.

[GitHub 공개 준비와 전체 후보 목록](docs/GITHUB_READINESS.md) · [API 명세](backend/API_SPEC.md) · [백엔드 실행](backend/README.md) · [프론트엔드 실행](frontend/README.md) · [데이터 분석](reports/dataset_analysis.md)

# CHARGE GAP

## 프로젝트 배포 현황
CHARGE GAP은 대한민국 전기차 보급 현황과 충전 인프라를 분석하는 데이터 시각화 웹 대시보드입니다.

소스 코드는 GitHub에서 관리하며, Render 배포 설정(`render.yaml`, `deploy/render/`)이 준비되어 있습니다.

배포 주소: https://charge-gap.onrender.com — **실제 서비스 생성·접속 상태는 저장소 안에서 확인되지 않았습니다(2026-10-31 기준).** 공개 여부와 동작은 Render 대시보드와 실제 접속으로 확인하세요. 아래 [무료 인터넷 배포 준비](#무료-인터넷-배포-준비) 절의 확인 항목도 참고하세요.

전기차 등록 데이터: 2026년 9월 기준

충전기 데이터: 2026년 10월 15일 조회 기준

주요 기술: Python, Pandas, Matplotlib, Seaborn, React, TypeScript, Flask, Docker

주요 기능: 전기차 등록 현황 및 충전 인프라 시각화, 지역별 비교, 충전기 유형·운영기관별 필터링, 그래프별 분석 결과 제공

웹사이트는 총 5개의 분석 페이지로 구성되어 있으며, 다양한 그래프와 지도 기반 시각화를 제공합니다.

※ Render 무료 서버로 배포하면 일정 시간 접속이 없을 때 서버가 절전 상태로 전환되어 최초 접속 시 데이터 로딩에 시간이 걸릴 수 있습니다.

## 주요 기능과 기술

- **Overview / EV Registration / Charging Infrastructure / Regional Explorer / Growth Trends**의 5개 페이지.
- 지역·충전기 유형·삭제 표시·운영기관 필터, URL 쿼리 기반 필터, 초기화·데이터 표·페이지네이션.
- 실제 API 기반 분석 설명, 툴팁·그래프 확대·애니메이션, 충전소 bbox 지도 조회.
- Flask 조회 API 10개, 박스플롯 집계·위치 조회 제한·요청 검증·JSON 오류 처리.
- Python: Pandas·NumPy·Matplotlib·Seaborn / 웹: React·TypeScript·Vite·Recharts·Leaflet / 실행: Waitress·Nginx·Docker Compose.

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

| 자료 | 출처·원본 | 기준·주의사항 |
|---|---|---|
| 전기차 등록 | `2026년_09월_자동차_등록자료_통계.xlsx`, 연료별 등록현황 | 2026-09, 순수 전기차 1,191,873대, 전남광주 포함 16개 지역. 기존 2025-12 원본·고정 PNG는 기록으로 보존. 새 파일의 재배포 조건 확인 필요 |
| 충전기·충전소 | [한국환경공단 전기자동차 충전소 정보 API](https://www.data.go.kr/data/15076352/openapi.do), getChargerInfo | 2026-10-15 조회, 충전기 527,433기·고유 충전소 101,091곳, 16개 지역 |
| 연도별 설치 | `충전기 설치 성장 추세_2026-10-15.xlsx` | 2011–2026, 2026년은 부분 연도. 정확한 집계 마감일은 원본에서 미확인 |
| 참고용 지역 출력 통계 | `우리 지역 급속 충전 여건_2026-10-15.xlsx` | 원본 대조·분석용. 웹 출력 히트맵은 API 집계 사용. 기준일·공개 조건 추가 확인 필요 |

전기차 등록(2026-09)과 충전기(2026-10-15)는 **16개 지역이 대응하지만 기준 시점이 다릅니다.** 서로 다른 시점으로 부족률을 계산하거나 현재 스냅샷을 2025년 12월 현황으로 해석하지 않습니다. 전남광주통합특별시를 광주·전남으로 임의 분리하지 않습니다. 삭제 표시 4,121기·비삭제 523,312기를 구분하고, 비삭제를 실제 이용 가능 상태로 해석하지 않습니다. `statUpdDt`는 상태 갱신일시이며 설치일이 아닙니다.

### 공개 조건: 확인 필요

API 포털에는 확인 시점에 공공누리 제1유형 출처표시 조건이 안내됐으나, 이것으로 Excel·파생 CSV·PNG·보고서 전체의 재배포 권리를 일괄 확정하지 않습니다. 각 원본의 이용 조건·제3자 권리·출처와 가공 사실 표기를 검토해야 합니다. **CSV·Excel의 공개 여부, 별도 데이터 제공 URL, 전달 방식과 담당자는 모두 미확정**입니다. 코드 공개 라이선스도 소유자가 별도 결정해야 합니다. 후보에 남은 PNG·보고서도 최종 권리·내용 검토 대상입니다.

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

데이터 파일(위 CSV 3개, `reports/chart_verification.json`, PNG 10개)이 있어야 백엔드 테스트가 실행됩니다. 2026-10-31 로컬 재검증 결과를 함께 적습니다.

| 대상 | 실행 위치·명령 | 2026-10-31 결과 |
|---|---|---|
| 백엔드 API·Render 기동 스크립트 | 프로젝트 루트, backend venv Python으로 `python -m pytest backend/tests deploy/render/tests -q` | 178 passed (캐시 테스트 포함) |
| 데이터 수집기 | 프로젝트 루트, 루트 `requirements.lock.txt`를 설치한 Python으로 `python -m unittest test_collector -v` | 12 passed |
| 프론트엔드 단위·회귀 | `frontend`에서 `npm test` (Node 내장 테스트 러너, 추가 의존성 없음) | 46개 통과 (줄바꿈 검사 1개는 Git 저장소 안에서만 실행) |
| 프론트엔드 타입·빌드 | `frontend`에서 `npm run typecheck`, `npm run build` | 통과 (외부 HTTPS API 주소 지정) |

`npm run build`는 production 빌드라서 `VITE_API_BASE_URL`이 비어 있거나 localhost를 가리키면 **빌드가 실패**합니다. 배포용으로는 실제 백엔드 HTTPS origin(또는 Compose의 `/backend`)을 지정합니다. 로컬 미리보기용 빌드만 `CHARGE_GAP_ALLOW_LOCAL_API_BUILD=1`을 함께 지정합니다(PowerShell: `$env:CHARGE_GAP_ALLOW_LOCAL_API_BUILD='1'; npm run build`).

브라우저 회귀 테스트 `frontend/tests/keyboard.browser.cjs`·`navigation.browser.cjs`·`url-filters.browser.cjs`·`api-errors.browser.cjs`·`server-wake.browser.cjs`(서버 절전 복귀, 실제 시간 약 3.5분)는 Playwright `page`를 받는 모듈입니다. 로컬 백엔드·프론트엔드를 실행한 뒤 별도 Playwright 스크립트에서 `await require('./frontend/tests/navigation.browser.cjs')(page, 'http://127.0.0.1:5173')`처럼 호출합니다. Playwright는 프로젝트 의존성에 포함하지 않았습니다. 기존 폰트 자산 경고는 유지되며, 실제 공개 호스팅의 HTTPS·CORS는 별도 실접속 검증 대상입니다. 2026-10-19 배포 준비 기록: [최종 GitHub·Render 준비 결과와 전체 파일 목록](reports/github_render_final_readiness_2026-10-19.md).

## 무료 인터넷 배포 준비

이 절은 2026-10-19 배포 준비 시점의 기록입니다. 이후 실제 Render 서비스 생성·공개 여부는 저장소에서 확인되지 않으므로 Render 대시보드에서 확인하세요.

구조는 **Render Static Site(React) + Free Docker Web Service(Flask) + 승인된 private S3 호환 저장소**입니다. 로컬 Compose/18080 설정과 분리해 `render.yaml`, `deploy/render/Dockerfile` 및 시작 시 검증 다운로드를 준비했습니다. CSV·메타데이터·기존 PNG 10개 총 14파일(231.287MiB)은 이미지에 포함하지 않습니다.

백엔드는 Render의 PORT로 0.0.0.0에 bind하고 Waitress/수치 라이브러리 스레드를 1로 제한합니다. 프론트엔드 `VITE_API_BASE_URL`에는 백엔드의 실제 HTTPS origin을(비어 있거나 localhost이면 빌드 실패), 백엔드 `CHARGE_GAP_CORS_ORIGINS`에는 프론트엔드의 정확한 HTTPS origin을 넣습니다. Static Site의 `/*` → `/index.html` rewrite로 React Router 새로고침을 지원합니다. private 저장소 endpoint·read credentials는 Render 환경 설정에만 넣고 VITE_*나 코드에 넣지 않습니다.

2026-10-19 실제 비공개 R2 다운로드 포함 Linux 시험에서 14개 파일의 크기·SHA-256, API 96/96, 메모리 512MiB·CPU 0.1 제한을 통과했습니다. 최고 메모리는 426.18MiB로 약 85.82MiB의 여유를 확보했고 메모리 제한 이벤트·OOM·재시작은 0회였습니다. 서버 준비 시간은 약 74초였습니다. 다운로드·해시 검증·CSV 파싱의 파일 캐시 반환 최적화를 Render Dockerfile이 복사하는 백엔드 코드에 반영했습니다. [측정 근거](reports/r2_cache_memory_optimization_2026-10-19.md).

R2 private 버킷에 14개 파일 업로드·검증과 읽기 전용 자격증명 교체는 완료됐습니다. 현재 객체는 버킷 루트의 manifest 상대 경로에 있으므로 `CHARGE_GAP_S3_PREFIX`는 **비워 둡니다**. 실제 비밀값은 Render 서버 환경 설정에만 입력합니다. R2는 종량제이며 계정 전체 무료 사용량 안에서 월 $0를 예상하되 무제한 무료를 보장하지 않습니다. Render Free의 유휴 종료 후에는 재다운로드·초기화 지연이 있습니다.

EV 자료의 공식 첨부 목록과 통계누리 이용정책, 충전기 설치 추이의 공식 대응 표를 확인했습니다. 개별 파일·표에 적용되는 공개 이용 조건의 최종 확인은 남아 있습니다. 데이터와 파생 그래프의 공개 허용을 확정하기 전에는 인터넷 공개 배포를 진행하지 않습니다. [출처·이용 조건 확인 기록](docs/DATA_SOURCE_RIGHTS.md).

**2026-10-19 기록 기준으로는 Render 서비스 생성 전이었습니다. 현재 배포 상태는 확인되지 않았습니다.** 실제 환경변수·실행 방법·단계별 사용자 작업은 [공개 배포 준비 안내](docs/RENDER_DEPLOYMENT.md)를 참고하세요. GitHub에는 CSV·Excel·자격증명을 올리지 않으며, clone만으로 데이터가 제공되지는 않습니다. 로컬 실행에는 별도 승인된 데이터 공급이, Render 실행에는 비공개 R2 읽기 권한이 필요합니다.

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

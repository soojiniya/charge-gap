# CHARGE GAP

대한민국 전기차 보급과 충전 인프라를 분석하는 데이터 시각화 수업 과제용 웹 대시보드입니다. Flask API가 검증된 CSV를 조회하고 React가 5개 분석 페이지·주요 그래프 10개·지도를 제공합니다. Matplotlib·Seaborn으로 제작한 보고서용 PNG 20개와 분석 문서도 포함합니다.

> **소스만 clone하면 실행되지 않습니다.** 데이터 재배포 조건과 별도 공급 경로는 아직 미확정입니다. 모든 CSV·Excel을 Git과 Docker 이미지에서 제외하며, 아래 CSV 3개는 권한 있는 경로로 별도 준비해야 합니다. 공개 다운로드 주소나 자동 다운로드 기능은 없습니다. 기존 대시보드 실행에는 공공 API 인증키가 필요하지 않습니다.

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
| 전기차 등록 | `2025년_12월_자동차_등록자료_통계.xlsx`, 연료별 등록현황 | 2025-12, 전기차 899,101대, 17개 시도. 원본 제공기관·원문 URL·재배포 조건 추가 확인 필요 |
| 충전기·충전소 | [한국환경공단 전기자동차 충전소 정보 API](https://www.data.go.kr/data/15076352/openapi.do), getChargerInfo | 2026-10-15 조회, 충전기 527,433기·고유 충전소 101,091곳, 16개 지역 |
| 연도별 설치 | `충전기 설치 성장 추세_2026-10-15.xlsx` | 2011–2026, 2026년은 부분 연도. 정확한 집계 마감일은 원본에서 미확인 |
| 참고용 지역 출력 통계 | `우리 지역 급속 충전 여건_2026-10-15.xlsx` | 원본 대조·분석용. 웹 출력 히트맵은 API 집계 사용. 기준일·공개 조건 추가 확인 필요 |

전기차 등록과 충전기 자료는 **기준 시점과 행정구역 체계가 다릅니다.** 서로 다른 시점으로 부족률을 계산하거나 현재 스냅샷을 2025년 12월 현황으로 해석하지 않습니다. 전남광주통합특별시를 광주·전남으로 임의 분리하지 않습니다. 삭제 표시 4,121기·비삭제 523,312기를 구분하고, 비삭제를 실제 이용 가능 상태로 해석하지 않습니다. `statUpdDt`는 상태 갱신일시이며 설치일이 아닙니다.

### 공개 조건: 확인 필요

API 포털에는 확인 시점에 공공누리 제1유형 출처표시 조건이 안내됐으나, 이것으로 Excel·파생 CSV·PNG·보고서 전체의 재배포 권리를 일괄 확정하지 않습니다. 각 원본의 이용 조건·제3자 권리·출처와 가공 사실 표기를 검토해야 합니다. **CSV·Excel의 공개 여부, 별도 데이터 제공 URL, 전달 방식과 담당자는 모두 미확정**입니다. 코드 공개 라이선스도 소유자가 별도 결정해야 합니다. 후보에 남은 PNG·보고서도 최종 권리·내용 검토 대상입니다.

## 별도 데이터 준비: 실행 필수

승인된 기존 스냅샷을 다음 경로에 배치하세요. 데이터를 다시 수집할 필요는 없습니다.

| 경로 | 용도 | Git 후보 여부 |
|---|---|---|
| `data/processed/charger_info_clean.csv` | 전체 충전기, 약 240 MB | 제외·별도 준비 필수 |
| `data/processed/ev_registration_by_region_2025.csv` | EV 등록 통계 | 제외·별도 준비 필수 |
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

검증 명령: backend venv Python의 `-m pytest tests -q`, frontend의 `npm run typecheck`·`npm run build`. 이전 검증에서 Flask 82개 테스트·타입 검사·빌드가 통과했습니다. 이번에는 문서·제외 규칙만 정비해 테스트를 반복하지 않았습니다. 기존 폰트 자산 경고는 유지되며 외부 공개 호스팅의 HTTPS·CORS·데이터 제공 정책은 별도 검토해야 합니다.

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

현재 Git 저장소는 초기화되지 않았습니다. 저장소 생성·commit·push는 수행하지 않았습니다. `.gitignore`는 `.env`·인증키 파일·가상환경·node_modules·캐시·로그·임시 파일과 **모든 CSV·Excel**을 제외합니다. `.env.example`은 비밀값 없는 공개 설정 예시만 허용합니다. `.dockerignore`는 기본 전체 제외 후 필요한 코드·설정만 허용합니다.

후보 목록은 공개 권리 승인이나 실제 staging 목록이 아닙니다. 향후 staging 시 파일 목록과 비밀정보를 다시 검사해야 합니다. 이미 추적된 파일은 `.gitignore`만으로 제외되지 않습니다.

[GitHub 공개 준비와 전체 후보 목록](docs/GITHUB_READINESS.md) · [API 명세](backend/API_SPEC.md) · [백엔드 실행](backend/README.md) · [프론트엔드 실행](frontend/README.md) · [데이터 분석](reports/dataset_analysis.md)

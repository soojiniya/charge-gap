# Docker 구성 검증 기록

로컬 Docker Compose 실행 구성(`compose.yaml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`)의 검증 기록입니다. 공개 배포(Render)용 백엔드 이미지는 `deploy/render/`의 별도 구성이라 이 문서의 대상이 아닙니다.

## 최신 검증: 2026-11-14 (KST)

**결과: 이미지 빌드·실행 성공, backend·frontend 모두 Healthy, `http://localhost:18080` 접속 성공 (사용자 PC에서 직접 확인).**

| 항목 | 결과 |
|---|---|
| Docker | 29.8.2 |
| Docker Compose | v5.6.0 |
| `docker compose build` | 성공 (frontend·backend 이미지) |
| `docker compose up -d --no-build` | 성공 |
| `docker compose ps` | frontend·backend 모두 Healthy |
| 브라우저 `http://localhost:18080` | 접속 성공 |
| 브라우저 새로고침 | 최신 UI 표시 확인 |
| 전기차 등록 데이터 마운트 | `ev_registration_by_region_2026_09.csv` (현재 `compose.yaml` 기준) |

이 표의 내용만 이번에 확인한 결과입니다. 아래 항목은 2026-11-14에 **확인하지 않았으며**, 새로 검증한 것으로 보지 않습니다.

- `curl` 등으로 확인하는 API 경로별 응답(HTTP 상태·JSON 내용·PNG 응답)
- 페이지별 직접 접근, 필터·박스플롯·그래프 PNG 등 세부 기능 동작
- 컨테이너 안에서 실행하는 백엔드·프론트엔드 테스트
- `docker compose config`, 이미지 digest·플랫폼, 이미지 레이어 안에 데이터·비밀정보가 없는지에 대한 직접 검사
- 기동 시간·메모리 사용량
- `docker compose down` 종료
- 지도 영역 표시. Compose 빌드에는 카카오맵 키를 전달하지 않으므로, README 설명대로 지도 자리에 키 설정 안내가 나오는 것이 예상 동작입니다.

## 현재 구성 (2026-11-14 문서 정리 시점 파일과 대조)

- `backend/Dockerfile`: `python:3.12-slim-bookworm`. `backend/requirements.docker.txt`의 런타임 14개 고정 버전 설치, 비 root 사용자(UID 10001), `chargegap_api/` 소스만 복사, Waitress 4스레드로 포트 5000 실행.
- `frontend/Dockerfile`: `node:24-bookworm-slim`에서 `npm ci`·production build(`VITE_API_BASE_URL=/backend`) 후 `nginx:stable-alpine`으로 정적 파일 제공. 카카오맵 키 등 `VITE_*` 비밀값은 전달하지 않음.
- `frontend/nginx.conf`: `/backend/` 접두사를 떼고 `backend:5000`의 `/api/...`로 프록시(질의 문자열 유지, 읽기 제한 120초). `/healthz` 응답, 누락된 `/assets/`는 404, 그 밖의 경로는 React SPA fallback. CSP·`X-Frame-Options` 등 보안 헤더 적용(로컬 HTTP라 HSTS 없음).
- `compose.yaml`
  - frontend만 `127.0.0.1:18080:80`으로 공개하고, backend는 내부 포트 5000만 엽니다.
  - backend 건강 확인: 컨테이너 안에서 `/api/charts` 호출(30초 간격, 시작 유예 90초, 5회 재시도).
  - frontend 건강 확인: `/healthz` 호출. backend가 Healthy가 된 뒤 frontend가 시작됩니다.
  - 두 서비스 모두 `no-new-privileges`, `init` 사용. CORS 추가 허용 목록은 비워 둠(같은 origin).
  - 인증키 참조·`env_file`·호스트 `.env` 마운트가 없습니다.
- `.dockerignore`: 기본 전체 제외 후 빌드에 필요한 소스·설정만 허용. CSV·Excel·`.env`·인증 파일은 빌드 컨텍스트에 들어가지 않습니다.

### 읽기 전용 마운트 (현재)

| 호스트 상대 경로 | 컨테이너 경로 |
|---|---|
| `data/processed/charger_info_clean.csv` | `/app/data/processed/charger_info_clean.csv` |
| `data/processed/ev_registration_by_region_2026_09.csv` | `/app/data/processed/ev_registration_by_region_2026_09.csv` |
| `data/processed/charger_installation_trend.csv` | `/app/data/processed/charger_installation_trend.csv` |
| `reports/chart_verification.json` | `/app/reports/chart_verification.json` |
| `outputs/charts/` | `/app/outputs/charts/` |

모두 `read_only: true`, `create_host_path: false`입니다. 이미지에 CSV를 복사하지 않습니다. 백엔드 코드(`backend/chargegap_api/data.py`)가 읽는 전기차 등록 파일도 `ev_registration_by_region_2026_09.csv`(2026년 9월 말 기준)입니다. 이전 파일 `ev_registration_by_region_2025.csv`는 PC에 남아 있을 수 있지만 현재 구성에서는 마운트하거나 읽지 않습니다.

### 2026-10-17 기록과 달라진 점

| 항목 | 2026-10-17 기록 (아래 이력) | 현재 |
|---|---|---|
| 전기차 등록 데이터 파일 | `ev_registration_by_region_2025.csv` | `ev_registration_by_region_2026_09.csv` |
| Docker·Compose 버전 | 기록 없음 | Docker 29.8.2 · Compose v5.6.0 |
| 페이지 | 직접 접근 확인 목록 5개 경로 | 6개 페이지(`/python-visualization` 추가) |
| 지도 | 당시 지도 구현 기준 "지도 정상 표시" | 카카오맵으로 바뀜. Compose 빌드에는 키가 없어 키 설정 안내 표시(예상 동작, 이번에 별도 확인 안 함) |
| Vite | 6.4.4 (당시 빌드 로그) | `frontend/package.json` 6.4.5 |
| 테스트 | Flask 테스트 82개 등 당시 결과 | 이번 Docker 검증에서는 테스트를 실행하지 않음 |
| 실행 명령 | `build` 후 `up -d --wait` 안내 | 이번 확인은 `build` 후 `up -d --no-build`로 두 단계 실행. README의 `up -d --build --wait`는 같은 빌드·실행을 한 번에 하는 명령 |

## 다시 확인할 때 쓰는 명령

프로젝트 최상위 폴더에서 실행합니다. 2026-11-14 기록에 포함된 것은 버전 확인, `build`, `up -d --no-build`, `ps`, 브라우저 접속뿐입니다.

```sh
docker compose version
docker compose config --quiet
docker compose build
docker compose up -d --no-build --wait --wait-timeout 240
docker compose ps
curl http://localhost:18080/backend/api/overview
docker compose down
```

브라우저에서는 `http://localhost:18080`과 `/ev-registration`, `/charging-infrastructure`, `/regional-explorer`, `/growth-trends`, `/python-visualization`의 직접 접근·새로고침을 확인합니다. `docker compose down`은 원본 바인드 파일을 지우지 않습니다. 이 구성은 로컬 실행용이며 외부 공개 호스팅의 HTTPS·접근 통제·데이터 재배포 승인을 대신하지 않습니다.

---

## 이력: 2026-10-17 검증 기록

아래는 2026-10-17 당시 기록을 그대로 보존한 것입니다. 파일명(`ev_registration_by_region_2025.csv`), 테스트 수, 버전, 확인 경로는 **당시 구성 기준**이며, 현재 구성은 위 절을 따릅니다.

검증일: 2026-10-17 (KST)

**현재 상태: Docker 이미지 빌드·실행 성공 (사용자 확인), 로컬 포트 18080.**

2026-10-17 사용자가 이미지 2개 빌드 성공, backend·frontend Healthy, `http://localhost:18080` 접속 및 실제 KPI·그래프·필터·지도 정상 표시, `docker compose down` 정상 종료를 확인했다. 현재 `compose.yaml`도 `127.0.0.1:18080:80`이다. 아래 호스트/스키마 검증은 최초 작성 당시의 기록이며, 이번 GitHub 준비 단계에서 Docker를 재실행하거나 원본 로그·이미지 digest를 새로 수집하지 않았다.

### 구성

- `backend/Dockerfile`: Python 3.12, 기존 lock에서 추린 런타임 14개 고정 버전, 비 root 사용자, Waitress 4스레드.
- `backend/requirements.docker.txt`: 테스트 의존성을 제외한 런타임 목록. 기존 lock 버전과 모두 일치.
- `frontend/Dockerfile`: Node 24의 `npm ci`·production build → Nginx 다단계 이미지. 개발 서버 미사용.
- `frontend/nginx.conf`: `/backend/` 접두사를 제거해 Flask `/api/...`에 전달. 질의 문자열 유지, React 직접 URL 접근용 SPA fallback, 정적 자산 누락 시 404.
- `compose.yaml`: 웹만 `127.0.0.1:18080` 공개, backend는 내부 5000, backend 건강 확인 후 frontend 시작.
- `.dockerignore`: 기본 전체 제외 후 소스·빌드 설정만 허용. 데이터·기존 PNG·보고서는 로컬 바인드 마운트로만 공급.
- `README.md`: 설치 준비, 실행·종료, 로그, 데이터 공급, 포트 변경, 오류 확인 절차 추가.

브라우저는 `VITE_API_BASE_URL=/backend`를 사용하므로 호스트 포트나 Docker 내부 서비스 이름을 JavaScript에 하드코딩하지 않는다. 같은 origin의 Nginx를 통해 통신하고 컨테이너의 CORS 추가 허용 목록은 비워 둔다. 기존 개발 실행의 CORS 동작은 변경하지 않았다. Compose에 인증키 참조·env_file·호스트 .env 마운트가 없다.

### 읽기 전용 마운트

| 호스트 상대 경로 | 컨테이너 경로 |
|---|---|
| `data/processed/charger_info_clean.csv` | `/app/data/processed/charger_info_clean.csv` |
| `data/processed/ev_registration_by_region_2025.csv` | `/app/data/processed/ev_registration_by_region_2025.csv` |
| `data/processed/charger_installation_trend.csv` | `/app/data/processed/charger_installation_trend.csv` |
| `reports/chart_verification.json` | `/app/reports/chart_verification.json` |
| `outputs/charts/` | `/app/outputs/charts/` |

5개 원본 경로가 실제 존재함을 확인했다. 모두 `read_only: true`이며 `create_host_path: false`라서 파일이 없을 때 빈 디렉터리를 자동 생성하지 않는다. 이미지에 CSV를 COPY하지 않는다. 재배포 승인이 확인되지 않은 데이터를 이미지·저장소로 공개하지 않는다.

### 통과한 확인

| 항목 | 결과 |
|---|---|
| 기존 Flask 테스트 | 82개 통과, 실패·오류 0 (23.69초) |
| TypeScript 검사 | exit 0 |
| production build | exit 0, `/backend` 빌드 설정, Vite 6.4.4 |
| 호스트 Waitress WSGI 실행 | 정상 시작, 별도 임시 포트 5185 사용 |
| `/api/overview` | HTTP 200, JSON |
| 지역 36·유형 04·비삭제·기관 ME 복합 박스플롯 | HTTP 200, 충전기 70기·표본 37곳 |
| `/api/charts` | HTTP 200, JSON |
| `/api/charts/1/image` | HTTP 200, PNG 시그니처 확인 |
| Compose YAML 파싱·공식 Compose JSON Schema | 통과 |
| Dockerfile COPY 원본 경로 | 모두 존재 |
| 런타임 14개 pin | 기존 검증 lock과 일치 |
| 알려진 인증키 노출 | COPY 원본 및 새 빌드 산출물에서 원문·인코딩 형태 일치 없음 |
| 기존 파일 보존 | 데이터·PNG·기존 보고서·프론트엔드 소스 174개 SHA256 동일 |

호스트의 WSGI 시험은 컨테이너 내부 시험을 대신하지 않는다. React 빌드 출력과 검증용 설치 패키지·로그·공식 스키마는 프로젝트 밖 작업 폴더에 저장했다. 기존 소스·데이터·API 응답 구조를 바꾸거나 데이터를 재수집하지 않았다. 기존 최종 검증/배포 준비 보고서도 당시 기록으로 보존했다.

### 최초 작성 당시 미검증 항목 (이력)

최초 구성 때는 `docker` 명령과 일반적인 Docker Desktop CLI 경로가 확인되지 않아 아래를 미검증으로 기록했다. 이후 사용자가 빌드·Healthy·브라우저 연동 성공을 확인했다. 아래는 당시 이력이며 현재 전체 실행이 미완료라는 뜻은 아니다. 이미지 레이어 직접 검사와 digest·플랫폼·세부 성능 기록은 새로 제공되지 않았다.

- `docker compose config`의 실제 CLI 실행. YAML/공식 스키마 검증과 별개다.
- `docker compose build`·`up`, Linux 이미지의 패키지 설치와 CPU 아키텍처별 wheel 호환성.
- 실제 Nginx 설정 로딩·API/PNG 프록시·SPA 새로고침, 컨테이너 건강 상태 및 브라우저 전체 연동.
- 실제 이미지 레이어에 데이터·비밀정보가 없는지 직접 검사. 현재는 COPY 목록·컨텍스트 제외 설정 및 소스/산출물 내용 검사 결과다.
- Docker Desktop의 파일 공유 권한, 비 root 사용자의 바인드 파일 읽기 권한, 초기 CSV 로딩 메모리·속도.

기존 한글 폰트 `.woff2` 자산 경로 경고는 남아 있다. 이번 작업에서 CSS나 디자인을 바꾸지 않았다. 새 Nginx는 누락된 `/assets/` 요청에 HTML을 대신 보내지 않고 404를 반환하므로 해당 경로는 후속 폰트 정비 대상이다. Python PNG 재생성 스크립트의 Windows 폰트 경로도 남지만, 컨테이너의 CSV 조회·기존 PNG 제공에는 그 스크립트를 실행하지 않는다.

베이스 이미지 태그는 Python 3.12/Node 24의 Debian 계열과 Nginx stable을 사용한다. 첫 실제 빌드에서 받은 이미지 digest와 플랫폼을 기록하면 재현성을 더 높일 수 있다. 최초 구성 작업에서는 이미지를 받거나 공개하지 않았다. 이후 사용자가 로컬 빌드·실행을 완료했으며, Git 저장소 생성·commit·push는 이번에도 수행하지 않았다.

### Docker가 준비된 PC에서 확인할 명령

프로젝트 최상위 폴더에서:

```sh
docker compose version
docker compose config --quiet
docker compose build
docker compose up -d --wait --wait-timeout 240
docker compose ps
curl http://localhost:18080/backend/api/overview
curl "http://localhost:18080/backend/api/station-size-distribution?region_code=36&charger_type=04&deletion=not_deleted&operator_id=ME"
```

브라우저에서 `http://localhost:18080`, `/ev-registration`, `/charging-infrastructure`, `/regional-explorer`, `/growth-trends`의 직접 접근·새로고침, 필터·박스플롯·기존 PNG·지도 동작을 확인한다. 종료는 `docker compose down`이며 원본 바인드 파일은 삭제하지 않는다. 폴더 복사 시 CSV의 SHA256과 기준일을 함께 검증한다. 로컬 과제 실행 구성이며 외부 공개 호스팅의 HTTPS·접근 통제·데이터 재배포 승인을 대신하지 않는다.

근거 문서: [Compose 서비스 설정](https://docs.docker.com/reference/compose-file/services/), [빌드 컨텍스트와 dockerignore](https://docs.docker.com/build/concepts/context/), [Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass), [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/), [공식 Compose 스키마](https://github.com/compose-spec/compose-spec/blob/main/schema/compose-spec.json).

상세 증거: `<이전 작업 폴더>\work\docker_readiness`의 `verification.json`, `wsgi_http.json`, `pytest.xml`, `pytest.log`, `typecheck.log`, `build.log`, `baseline.json`.

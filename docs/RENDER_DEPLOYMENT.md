# CHARGE GAP 인터넷 공개 배포 준비

확인일: 2026-10-19. **Linux 자원·기능 검증 PASS / 실제 공개 배포 준비 CONDITIONAL PASS**. 사용자에 의해 private R2 저장과 읽기 전용 토큰 설정이 완료됐고 실제 R2 다운로드 포함 512MiB·0.1 CPU 시험도 통과했다. Render 서비스는 아직 생성하지 않았으며 최종 최적화·배포 준비 변경은 Git commit/push 전이다.

## 구조

```text
브라우저 ─HTTPS─> Render Static Site (React dist)
        └HTTPS─> Render Free Docker Web Service (Waitress 1 thread)
                    ├─ 시작 시 비공개 S3 호환 저장소에서 14개 파일 다운로드
                    ├─ 크기/SHA-256 검증 뒤 원자적으로 배치
                    └─ 기존 Flask 앱으로 교체 실행 (다운로드 자격증명 제거)
```

PC와 Docker Desktop을 꺼도 호스팅 서비스가 실행한다. 다만 Render Free는 무중단 상시 서비스가 아니다. 유휴 15분 뒤 내려갈 수 있고, 재기동 시 임시 파일을 잃으므로 데이터 다운로드와 CSV 로딩을 다시 수행한다. 공식 안내의 기본 복귀 시간 외에 이 프로젝트의 다운로드/초기화 시간도 더해진다. 재기동 후에도 URL은 유지되지만 첫 API 응답이 늦을 수 있다. [Render Free 제한](https://render.com/docs/free).

로컬 `compose.yaml`·`backend/Dockerfile`·`frontend/Dockerfile`·루트 `.dockerignore`와 localhost:18080 실행은 유지한다. 배포는 `deploy/render/Dockerfile`과 그 전용 `.dockerignore`를 사용한다. Dockerfile 전용 ignore가 우선되는 것은 [Docker 공식 규칙](https://docs.docker.com/build/concepts/context/#dockerignore-files)에 따른다.

## 생성 파일과 역할

| 파일 | 역할 |
|---|---|
| render.yaml | Static + Docker 서비스 Blueprint 초안. API plan: free, 자동 배포 off |
| deploy/render/Dockerfile | 기존 최적화 앱·고정 의존성 + 배포 진입점. 데이터/PNG/.env 복사 없음 |
| deploy/render/Dockerfile.dockerignore | 빌드 입력 기본 제외 후 런타임 코드·manifest만 허용 |
| deploy/render/start.py | PORT/HTTPS origin 검증 → 다운로드 subprocess → Waitress exec |
| deploy/render/download_data.py | HTTPS S3 SigV4 GET, 1MiB 스트림, 크기/해시, 최대 3회/백오프, 안전한 오류 |
| deploy/render/data-manifest.json | 승인 대상 파일 14개의 상대 경로·크기·SHA-256. 주소·자격증명·레코드 없음 |
| deploy/render/frontend.env.example | 공개 API origin만 있는 예시. 실제 주소는 아직 없음 |
| deploy/render/tests/test_deployment.py | 기동/다운로드/검증/보존/오류/필터 origin 관련 테스트 |

manifest는 현재 스냅샷의 내용 고정 장치다. 데이터가 바뀌면 새 기준일·검증·manifest 갱신이 필요하며, 자동 재수집하지 않는다. 현재 CSV/PNG를 변경하지 않았다.

## 설정값

### 백엔드 Render Environment

실제 비밀값은 **Render 환경 설정에만** 입력한다. 자격증명·비공개 endpoint·버킷·비공개 prefix는 Git/Blueprint 값/빌드 ARG/VITE_*에 넣지 않는다. `sync: false`는 배포 시 사용자 입력용이다. 현재 prefix는 비공개 주소가 아닌 빈 문자열이므로 Blueprint에는 `value: ''`로 명시했다. 수동 설정에서 이 변수를 생략해도 같은 기본값이다.

| 키 | 값/규칙 |
|---|---|
| PORT | Render 제공 값 사용. 없으면 10000. 0.0.0.0으로 bind |
| CHARGE_GAP_CORS_ORIGINS | 실제 Static Site의 정확한 HTTPS origin. 끝 `/`·경로·와일드카드 금지. 복수는 쉼표 |
| CHARGE_GAP_S3_ENDPOINT | 비공개 S3 API origin. HTTPS, 경로/쿼리/내장 비밀번호 없음 |
| CHARGE_GAP_S3_BUCKET | 승인된 private bucket 이름 |
| CHARGE_GAP_S3_PREFIX | **현재는 빈 문자열**. 14개 객체가 버킷 루트의 manifest 상대 경로에 있으므로 snapshots/...를 임의로 추가하지 않음 |
| CHARGE_GAP_S3_REGION | R2는 auto. 다른 호환 공급자는 해당 region을 확인 |
| CHARGE_GAP_S3_ACCESS_KEY_ID | 대상 버킷 Object Read only 자격증명 ID |
| CHARGE_GAP_S3_SECRET_ACCESS_KEY | 같은 자격증명의 비밀키 |
| CHARGE_GAP_S3_SESSION_TOKEN | 임시 자격증명 방식일 때만 추가. 기본 Blueprint에서는 사용하지 않음 |

Waitress `--threads=1`, OPENBLAS/OMP/MKL/NUMEXPR/VECLIB/BLIS 스레드 1은 진입점에서 강제한다. 기존 Dockerfile의 로컬 기본 4스레드와 구분한다. 저장소 자격증명은 다운로드 subprocess 종료 뒤 Flask 실행 환경에서 제거한다. public API가 따로 이를 반환하는 경로도 추가하지 않았다. 공공데이터포털 수집 인증키는 배포에 필요 없다.

수동 Web Service 설정은 Runtime Docker, Plan **Free**, Root Directory 비움, Docker Context `.`, Dockerfile `deploy/render/Dockerfile`, Health Check `/api/charts`, Auto Deploy Off다. Start Command를 별도로 덮어쓰지 않고 Docker CMD를 사용한다. Blueprint를 나중에 적용해도 같은 구성을 사용한다.

### 프론트엔드 Render Environment

`VITE_API_BASE_URL` = **실제 백엔드 HTTPS origin**. `/api`를 붙이지 않는다. 기존 클라이언트가 `/api/...`를 이어 붙인다. 비어 있으면 기존 localhost fallback이 선택되므로 반드시 설정한다. Vite 값은 빌드 시 JS에 들어가는 공개 정보다. 비밀값을 VITE_*에 넣지 않는다. 변경 시 프론트엔드 재빌드가 필요하다.

Render Static 설정: Root Directory `frontend`, Build `npm ci && npm run build`, Publish Directory `dist`, Node 24. React Router 직접 접근/새로고침을 위해 `/*` → `/index.html` **rewrite**를 설정한다. [Render rewrite 문서](https://render.com/docs/redirects-rewrites).

별도 origin 간 HTTPS 연결이므로 Nginx `/backend` 프록시는 클라우드 구조에서 사용하지 않는다. 로컬 Compose에서는 계속 `/backend`를 사용한다. HTTPS는 Render가 TLS를 종료하며 컨테이너 자체는 PORT의 HTTP를 제공한다. [Render Web Services](https://render.com/docs/web-services).

## 필수 파일과 접근 경로

S3 객체 key는 `<PREFIX>/<아래 상대 경로>`다. 컨테이너에서는 `/app/<상대 경로>`로 저장한다.

| 상대 경로 | 바이트 | 접근 용도 |
|---|---:|---|
| data/processed/charger_info_clean.csv | 240,535,251 | Flask 내부 로딩만. CSV 다운로드 라우트 없음 |
| data/processed/ev_registration_by_region_2025.csv | 3,158 | 내부 로딩 |
| data/processed/charger_installation_trend.csv | 2,353 | 내부 로딩 |
| reports/chart_verification.json | 48,038 | /api/charts 메타데이터 원본 |
| outputs/charts/01_ev_registration_top10.png | 108,203 | /api/charts/1/image |
| outputs/charts/02_ev_vehicle_type_donut.png | 132,110 | /api/charts/2/image |
| outputs/charts/03_ev_commercial_stacked.png | 97,846 | /api/charts/3/image |
| outputs/charts/04_chargers_by_region.png | 143,670 | /api/charts/4/image |
| outputs/charts/05_station_location_scatter.png | 419,475 | /api/charts/5/image |
| outputs/charts/06_charger_type_pie.png | 186,761 | /api/charts/6/image |
| outputs/charts/07_charger_output_histogram.png | 102,631 | /api/charts/7/image |
| outputs/charts/08_operator_chargers_top10.png | 146,636 | /api/charts/8/image |
| outputs/charts/09_annual_charger_installation_trend.png | 161,346 | /api/charts/9/image |
| outputs/charts/10_regional_output_heatmap.png | 434,230 | /api/charts/10/image |

**합계 242,521,708바이트 = 231.287MiB**, 14개. 기존 신규 보고서 PNG 10개는 런타임 필수가 아니다. 전체 상세 해시는 manifest에서 확인한다. 100회 재기동이면 약 24.25GB가 저장소에서 다시 전송된다(요청 헤더/재시도 제외 계산). 무료 disk가 없으므로 각 기동 간 다운로드 캐시의 지속을 가정하지 않는다.

## 저장소 비교와 추천

| 후보 | 공식 무료 범위/제약 | 이 프로젝트 판단 |
|---|---|---|
| **Cloudflare R2 Standard** | 10GB-month, Class A 100만·B 1,000만 회/월, egress 무료. 무료 초과 종량제 | **추천**. 큰 단일 파일·private S3 read token·반복 GET에 적합. R2 등록 checkout/결제 조건을 사용자가 확인해야 함 |
| Supabase Free Storage | 1GB storage, 5GB egress + 별도 cached egress, 파일 최대 50MB, 유휴 프로젝트 pause | 240.5MB 단일 CSV를 그대로 올릴 수 없어 현재 공급 형식에는 부적합. 추가 분할/압축은 이번 범위에서 하지 않음 |
| Backblaze B2 | 첫 10GB storage 무료, 평균 월 저장량의 3배까지 egress 무료 | S3 호환 대안이나 약 0.24GB 스냅샷의 잦은 재기동에서 무료 전송량이 작을 수 있음. Render 전송이 무료 파트너 경로라고 가정하지 않음 |

출처: [R2 가격](https://developers.cloudflare.com/r2/pricing/), [R2 등록](https://developers.cloudflare.com/r2/get-started/), [Supabase 가격/제한](https://supabase.com/pricing), [B2 가격](https://www.backblaze.com/cloud-storage/pricing).

R2는 **무료 사용량이 있는 종량제 서비스**다. 사용자에 의해 구독·private 버킷·Standard 저장 및 $1 비용 알림이 설정됐고 14개 파일 업로드·SHA-256 검증이 완료됐다. $1 알림은 지출 상한이 아니다. 계정 전체 사용량으로 비용을 확인하며 월 요금 0원을 무조건 보장하지 않는다.

추천 설정은 private bucket + Standard + Public Development URL/r2.dev 비활성 + public custom domain 없음이다. 업로드 권한과 런타임 읽기 자격증명은 분리하고, 런타임은 해당 버킷의 **Object Read only**만 준다. S3 자격증명은 R2 API endpoint용으로 발급한다. 일반 Cloudflare REST Bearer token을 S3 secret으로 넣지 않는다. [R2 인증 권한](https://developers.cloudflare.com/r2/api/tokens/).

고정 presigned URL은 만료 뒤 재기동이 실패할 수 있어 기본 공급 방식으로 쓰지 않는다. 이번 구현은 매 요청 현재 시각으로 SigV4 헤더 서명을 만들며 브라우저에 내려주지 않는다. 자격증명 자체의 만료/폐기는 별도로 관리한다.

## 데이터 이용 조건 및 출처

| 자료 | 확인 상태 | 공개 전 필요한 일 |
|---|---|---|
| 한국환경공단 API | 포털에 공공저작물 출처표시 제1유형 확인 | 기관·데이터명·원문 링크·조회일·정제/집계 사실 표시, 특이 권리/현재 표시 재확인 |
| 2025년 12월 자동차 등록 Excel → EV CSV | 국토교통부 공식 첨부 목록·재이용 정책 확인 | 개별 공공누리 표시·로컬 원본 연결 증빙은 미확정 |
| 설치 성장 추세 Excel → growth CSV | 무공해차 통합누리집 공식 표와 32개 수치 대응 확인 | 해당 대시보드/Excel에 직접 적용되는 공개 조건은 미확정 |
| 지역 급속 충전 Excel | 참고 원본, 런타임 불필요. 공개 조건 **미확정** | 이번 공급 목록/이미지에서 제외 |
| PNG/메타데이터 | 프로젝트 제작 파생물. 입력 통계/이미지/폰트 권리와 공개 내용 확인 필요 | 차트의 기존 출처·기준일 유지, EV/growth 입력 조건까지 확인 |

API 공식 근거: [한국환경공단 전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do). 표시 예: “한국환경공단 전기자동차 충전소 정보(getChargerInfo), 2026-10-15 조회, CHARGE GAP 정제·집계”. EV 자료는 2025-12, 설치 통계 2026년은 부분 연도임을 각각 유지한다.

**비공개 저장소는 공개 표시/파생 데이터 배포 권리를 대신하지 않는다.** 브라우저에서 위치와 집계값, PNG를 볼 수 있고 API로 접근할 수 있으므로 권리 미확정 자료의 공개는 실제 배포 전에 해결해야 한다. 현재 UI/분석/기준일 문구를 변경하지 않았다. 원문 조건을 확인한 후 필요한 출처 링크·문구 보완 여부를 검토한다.

공식 URL·조건·출처 표시 예·미확정 근거는 [데이터 출처·공개 이용 조건 기록](DATA_SOURCE_RIGHTS.md)에 정리했다. 공식 페이지의 현재 갱신일을 과거 Excel의 정확한 마감일로 소급 적용하지 않는다.

지도는 기존 HTTPS OpenStreetMap 타일과 attribution을 유지한다. 브라우저 Referer를 차단하지 않고 bulk/prefetch/offline 다운로드를 하지 않는다. 타일 서비스 SLA를 보장하지 않으며 공개 트래픽이 커지면 적합한 타일 공급자를 검토한다. [OSM 타일 정책](https://operations.osmfoundation.org/policies/tiles/).

## 예상 비용 및 가용성

사용량 안에서는 **Render Static + Free API + R2 Standard 합계 월 $0 예상**이다. 고정비 0의 후보이며 초과 과금/서비스 정지까지 없다고 보장하지 않는다. 새 Hobby의 5GB/월 outbound 및 500 pipeline minutes를 기준으로 실제 대시보드 할당을 확인한다. [Render 대역폭](https://render.com/docs/outbound-bandwidth), [빌드 파이프라인](https://render.com/docs/build-pipeline).

Free API는 workspace 750시간/월을 공유하고 저장소를 대량 호출하는 서비스는 제한될 수 있다. R2 egress 무료가 Render의 서비스 개시 트래픽 정책까지 없애지는 않는다. 다운로드를 위해 keep-alive ping/유료 디스크를 추가하지 않았다. [Render Free 정책](https://render.com/docs/free).

231MiB 파일 전달·검증·0.1 CPU CSV 로딩이 첫 방문에 발생한다. 실제 R2 다운로드 포함 시험의 준비 완료는 74.078초였다. Render의 디스크·네트워크에서는 달라질 수 있어 실제 서비스의 health check와 cold start도 확인해야 한다. [Render 시작 timeout](https://render.com/docs/deploys#deploy-steps).

## 로컬 검증과 미검증

- 2026-10-19 최종 재확인: **118 passed in 16.54s**. 캐시 반환 구간·fallback과 기존 회귀 테스트를 포함한다. bounded read, 실패 재시도, 크기/해시, 기존 파일 보존, credential redaction, 경로 검증, HTTPS CORS, PORT/1 thread exec, 실패 시 기동 중단, PNG 10개 접근 경로/내용 등을 확인했다.
- 실제 14개 파일 크기·SHA-256 검증 통과.
- 외부 HTTPS API origin을 넣은 TypeScript 검사/production build 통과. 최종 출력은 Git 제외 경로 `work/github-render-final-prep/frontend-dist`에 저장해 기존 dist를 교체하지 않았다. package.json과 lock의 의존성·engines 일치도 확인했다. React 단위/E2E 테스트 스크립트는 현재 없어 별도로 실행한 것으로 기록하지 않는다.
- 기존 폰트 상대 경로 경고가 남아 있다. 디자인/폰트 소스는 변경하지 않았으며 실제 공개 페이지의 fallback/404를 확인해야 한다.
- API 클라이언트에는 network/HTTP/응답 형식 오류 처리와 1회 retry가 있다. Render spin-up의 HTML 페이지는 JSON 형식 오류로 처리될 수 있어 기다린 뒤 수동 재시도가 필요할 수 있다. 기존 오류 안내에 로컬 run.py 설명이 포함되는 점은 공개 배포 UX의 개선 후보로 기록하고 UI는 변경하지 않았다.
- 사용자 PC에서 생성된 실제 R2 Docker 시험 결과를 확인했다: 파일·SHA 14/14, API 96/96, 최고 메모리 426.184MiB, 여유 85.816MiB, memory.events max/oom/oom_kill=0, OOMKilled=false, 재시작 0회. Linux 전후 응답 SHA-256 96개도 모두 동일하다. [최종 메모리 검증](../reports/r2_cache_memory_optimization_2026-10-19.md).
- `backend/chargegap_api/file_cache.py`는 패키지 COPY와 전용 ignore의 *.py 허용에 포함된다. DataStore의 reader 및 배포용 download_data.py의 bounded writeback/hash 로직도 복사된다. 현재 빌드 경로는 확인했지만 Codex의 Docker 엔진 접근 거부로 이미지 내부 파일 해시를 다시 추출하지는 못했다. 시험 이미지 ID는 검증 보고서에 기록했다.
- R2 실인증 GET/크기/해시는 확인했다. 실제 Render의 TLS/CORS/Router/지도 브라우저 접속과 Blueprint 서버측 검증은 남아 있다. YAML은 공식 필드에 맞춰 작성했으며 계정의 실제 적용 검증은 다음 단계다.

로컬 확인:

```powershell
& backend/.venv/Scripts/python.exe -B -m pytest backend/tests deploy/render/tests -q
& backend/.venv/Scripts/python.exe -B deploy/render/download_data.py --verify-local .
docker build -f deploy/render/Dockerfile -t charge-gap-backend:render-prep .
```

샌드박스에서는 pytest --basetemp를 writable workspace 내부의 새 경로로 지정했다. Docker build는 일반 PowerShell에서 별도 태그로 수행할 수 있다. 자격증명 파일은 Git 제외 `work/`에 두고 로컬 Docker에는 비밀값을 인수에 넣지 않는 환경 전달 또는 --env-file을 사용한다. Render에는 서버 Environment에서만 입력한다. 이 문서에는 실제 값을 기록하지 않는다.

## 실제 배포 전 사용자 단계

1. 미확정 Excel/파생물 이용 조건 확인 및 공개 범위 승인.
2. 완료: R2 private Standard 저장 및 14개 업로드·SHA 검증. 현재 PREFIX는 빈 문자열이며 객체 경로는 manifest와 일치한다.
3. 완료: 버킷 한정 읽기 전용 자격증명으로 교체, 기존 업로드 토큰 폐기. 다음 단계에서 Render 서버에만 입력하고 6개월 만료 전 교체한다.
4. 완료: 실제 다운로드·기동·512MiB/0.1 CPU·96개 API 검증 PASS. 다음 단계에서 실제 HTTPS 두 origin을 결정한다.
5. 변경 목록·비밀정보·데이터 제외를 검토한 뒤 **사용자 승인 후** Git commit/push. Private 저장소 유지. 현재 최적화 코드/배포 설정은 로컬 변경이므로 GitHub의 과거 커밋만 연결하면 적용되지 않는다.
6. Render GitHub 연결 권한을 이 Private 저장소로 한정. Free API와 Static 설정을 수동 또는 준비된 Blueprint로 생성. 아직 생성하지 않는다.
7. 실제 두 URL을 VITE_API_BASE_URL/CORS에 교차 설정하고 프론트엔드 재빌드. deep-link 새로고침, cold-start 오류, 10개 API·필터·지도·PNG를 확인한다.

현재 남은 필수 항목은 **개별 EV/growth 공개 조건 확정, 승인 후 GitHub 반영, 실제 Render URL/환경변수 및 HTTPS 연동·cold start 검증**이다. 로컬 Compose는 계속 localhost:18080에서 독립적으로 사용한다.

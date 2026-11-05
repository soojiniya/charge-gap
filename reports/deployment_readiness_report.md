# CHARGE GAP 보안 조치 및 배포 준비 검증

작성: 2026-10-17T14:04:54.806993+09:00 (KST)  
대상: `<프로젝트 폴더>`

**판정: CONDITIONAL PASS — 의존성 보안 조치와 로컬 실행 검증은 통과, 외부 공개·컨테이너 배포에는 아래 준비 조건이 남아 있다.**

최종 npm audit는 전체/운영 의존성 모두 0건이다. TypeScript 검사·production build·Flask 82개 테스트가 통과했다. 데이터·기존 보고서·PNG 127개와 프론트엔드 소스 46개 SHA256이 작업 시작 시점과 같다. F1~F5는 사용자가 Claude에서 수정했다고 전달한 상태를 그대로 보존했다. 이번 검증은 의존성 변경의 대표 기능 회귀 확인이며, 과거 최종 검증 전체나 F1~F5 전수 시각 검증을 반복한 것이 아니다. 기존 `final_project_validation.md`는 당시 기록으로 유지했다.

## 1. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `.gitignore` | 비밀정보·의존성·로그·캐시·원본·과거 스냅샷·대용량 런타임 CSV 제외 |
| `frontend/package.json` | Router 7.18.4, Vite 6.4.4 명시적 고정, Node 엔진 범위 추가 |
| `frontend/package-lock.json` | 실제 설치 의존성과 엔진 동기화 |
| `README.md` (신규) | 데이터 별도 공급, Windows/Linux 실행, 공개 조건·배포 절차 |
| `frontend/README.md` | 검증 Node 버전, `npm ci`, 상위 실행 안내 연결 |
| `backend/README.md` | PC 경로 예시 설명 및 별도 데이터·플랫폼 안내 연결 |
| `reports/deployment_readiness_report.md` (신규) | 이번 결과 |

프론트엔드 디자인·차트 코드, Flask 코드·응답 구조, Python 생성 코드, 원본/정제 데이터, 기존 PNG와 분석 보고서를 수정하지 않았다. 빌드 과정에서 무시 대상인 `frontend/dist/`와 빌드 캐시, 설치 과정에서 `node_modules/`는 갱신됐다. 데이터 수집·전처리·PNG 재생성은 수행하지 않았다.

## 2. npm 보안 조치

| 시점 | critical | high | moderate | 전체 |
|---|---:|---:|---:|---:|
| 최초 실시간 재감사 | 0 | 4 | 1 | 5 |
| Router 6.30.6 / Vite 6.4.4 중간 확인 | 0 | 0 | 2 | 2 |
| 최종 Router 7.18.4 / Vite 6.4.4 | 0 | 0 | 0 | 0 |
| 최종 `npm audit --omit=dev` | 0 | 0 | 0 | 0 |

감사 숫자는 영향받는 패키지 수이며 독립적인 공격 수와 같지 않다. 최초에는 `@remix-run/router`, `react-router`, `react-router-dom`, `vite`가 high, `esbuild`가 moderate였다. `audit_before.json`에 개별 권고와 취약 범위를 보존했다. 감사는 작성 시점 등록된 npm 권고 기준이며 미래 취약점까지 보장하지 않는다. Python 의존성의 별도 CVE 전수 감사는 수행하지 않았다.

| 패키지 | 변경 전 | 최종 |
|---|---|---|
| react-router-dom | 6.28.0 | 7.18.4 |
| react-router (전이) | 6.28.0 | 7.18.4 |
| vite | 6.0.3 | 6.4.4 |
| esbuild (전이) | 최초 감사에서 `<=0.24.2` 취약 범위 | 0.25.12 |
| @remix-run/router (전이) | 최초 high 감사 대상 | 최종 의존성 트리에서 제거 |

처음에는 같은 메이저의 최신 패치를 적용했다. Vite 관련 high 및 esbuild 경고는 해소됐지만 Router 6에는 다음 moderate가 남아 명시적으로 Router 7.18.4로 변경했다. `npm audit fix --force`는 사용하지 않았다.

- [React Router 외부 이동 권고](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6): 패치 기준은 7.18.0 이상. 현재 앱은 고정된 내부 NavLink/Link 및 URLSearchParams 필터를 사용하며 비신뢰 입력을 이동 경로로 넘기는 코드는 발견하지 못했다. 잠재 조건이 적다는 이유로 경고를 방치하지 않고 패치했다.
- [React Router SSR hydration 권고](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg): 공식 문서는 Declarative Mode를 제외한다. 현재 앱은 BrowserRouter이며 수동 SSR/hydration을 사용하지 않는다. 최종 버전도 패치 범위에 있다.
- Vite 초기 버전의 파일 읽기·개발 서버 관련 경고는 패치 버전으로 해소했다. 정적 `dist/` 배포와 개발 서버 외부 노출은 공격 표면이 다르다. 개발 서버를 인터넷에 공개하지 않는다.

Router 7은 메이저 변경이다. 패키지 peer 조건인 React >=18, Node >=20에 현재 React 18.3.1·Node 24.21.0이 부합한다. 공개 API를 사용하는 기존 코드 변경 없이 타입·빌드·대표 브라우저 기능을 검증했다. React, Recharts, Leaflet 등 다른 직접 의존성은 유지했다. 기존 5173 개발 서버가 업데이트 전에 시작된 프로세스라면 **종료 후 재시작해야 실행 프로세스에도 패치가 적용된다.** 이 작업은 사용자의 기존 서버를 강제 종료하지 않았다.

설치에는 `--ignore-scripts`를 사용했다. Windows에서 실행 중인 이전 esbuild 바이너리를 제거할 수 없다는 EPERM 정리 경고가 있었으나 새 버전의 빌드가 성공했다. 잠긴 이전 임시 디렉터리는 무시 대상 `node_modules` 내부에 남을 수 있다. 개발 서버 종료 후 필요하면 정상적인 재설치로 정리한다. 이전 파일을 임의로 삭제하지 않았다.

## 3. 검증 결과

| 확인 | 결과 |
|---|---|
| `npm audit --json` | PASS: 전체 0건 |
| `npm audit --omit=dev --json` | PASS: 운영 의존성 0건 |
| `npm run typecheck` | PASS: exit 0 |
| `npm run build` | PASS: exit 0, Vite 6.4.4 |
| Flask pytest | PASS: 82개, 실패/오류/건너뜀 0, 21.84초 |
| backend `pip check` | PASS: No broken requirements found |
| backend lock 대조 | PASS: Python 3.12.10, 고정 패키지 20개 실제 설치 버전 모두 일치 |
| package/lock 엔진·의존성 대조 | PASS |
| 정상 API 10개 | PASS: HTTP 200, JSON 구조 확인 |
| 추가 HTTP 확인 5개 | PASS: 복합 필터·bbox·빈 유형 200, 잘못된 page/지역 400 |
| 브라우저 production 번들 | PASS: 5개 페이지 직접 접근, SVG 표시, 탐색 링크 |
| 지역·유형·삭제·기관 필터 | PASS: URL 상태·대표 응답·박스플롯 수치 일치 |
| 필터 초기화·빈 결과 | PASS: 쿼리 초기화, 관측 0건 유형의 빈 상태 |
| 대표 브라우저 JS 오류 | 0건. 폰트 경고는 아래에 별도 기록 |
| 원본·분석 자료·프론트 소스 보존 | PASS: 173개 SHA256 동일 |
| 알려진 인증키 노출 검사 | PASS: 공개 후보·빌드 번들·15개 API 응답에서 일치 없음 |

새 production 번들은 사용자 개발 서버와 충돌하지 않도록 로컬 5183 포트에서 확인했다. 기존 API 5000으로 향하는 브라우저 테스트 요청에는 Playwright가 **테스트 전용 CORS 허용 헤더만** 덧붙였다. JSON 본문과 상태 코드는 그대로 사용했고 제품 코드는 변경하지 않았다. 실제 5173 origin 허용은 별도 HTTP 요청으로 확인했다. 따라서 임의의 배포 origin이 이미 허용됐다는 의미는 아니며 배포 주소가 정해지면 CORS를 설정해야 한다.

복합 조건 `region_code=36&charger_type=04&deletion=not_deleted&operator_id=ME`는 충전기 70기·충전소 표본 37곳, Q1=1·중앙값=2·Q3=2, 수염 1~2, 이상치 5곳을 반환했다. 브라우저 필터 선택 후 같은 표본 37곳·이상치 5곳 설명을 확인했다. 모든 애니메이션 타이밍·툴팁·모바일 조합을 전수 재검증한 결과는 아니다.

| HTTP 요청 | 상태 | 소요 ms |
|---|---:|---:|
| `/api/overview` | 200 | 378.62 |
| `/api/ev-registration` | 200 | 24.10 |
| `/api/charger-regions` | 200 | 278.02 |
| `/api/charger-types` | 200 | 284.19 |
| `/api/charger-output` | 200 | 284.52 |
| `/api/operators` | 200 | 345.97 |
| `/api/growth` | 200 | 3.47 |
| `/api/locations` | 200 | 686.98 |
| `/api/charts` | 200 | 23.02 |
| `/api/station-size-distribution` | 200 | 282.32 |
| `/api/station-size-distribution?region_code=36&charger_type=04&deletion=not_deleted&operator_id=ME` | 200 | 83.86 |
| `/api/locations?bbox=126.8,37.4,127.2,37.7&limit=5&page=1` | 200 | 700.74 |
| `/api/locations?page=0` | 400 | 87.05 |
| `/api/overview?region_code=99` | 400 | 25.13 |
| `/api/charger-types?charger_type=09` | 200 | 41.64 |

소요시간은 로컬 단일 실행 값이며 운영 부하 성능 보장이 아니다. 이번 15개 요청 범위는 3.47~700.74ms다. 필터 정확성의 더 넓은 범위는 다시 통과한 Flask 테스트가 확인한다.

## 4. GitHub 제외 및 데이터 공급

프로젝트에는 Git 저장소가 없다. `git rev-parse`가 실패했으므로 실제 index/과거 커밋의 비밀정보는 검증할 수 없다. 프로젝트에 `git init`을 하지 않았다. 제외 규칙 확인용 임시 Git 메타데이터는 프로젝트 밖 검증 작업 폴더에서만 생성했다. 아래 목록은 **향후 `git add` 대상 후보**이며 실제 업로드나 공개 승인이 아니다.

- `.env`, `.env.*` (값 없는 `.env.example` 예외), 개인키·자격 증명 JSON, service/api key 파일, secrets 폴더, `.npmrc`·`.pypirc` 제외.
- `.venv`, venv, node_modules, Python/pytest/타입·린트 캐시, dist/build, tsbuildinfo, Matplotlib 캐시 제외.
- 모든 `*.log`, logs, 임시/백업/검증 작업 폴더 제외. JSON 등 다른 확장자의 로그까지 자동으로 비밀값이 제거되는 것은 아니므로 후보 파일 내용 검사도 병행했다.
- `data/raw/` 전체, `data/processed/history/`, 전체 런타임 `charger_info_clean.csv` 제외.
- 작은 processed 집계 CSV, 기존 PNG·분석 보고서·소스·API 명세는 후보에 유지한다. 큰 정제 CSV를 단순 제거한 채 실행 가능하다고 주장하지 않는다.

원본 CSV 약 212MB, 전체 정제 CSV 약 240MB, 과거 전체 정제본 약 240MB는 후보에 포함되지 않는다. 후보 중 50MB 초과 파일은 없다. `.env`, 가상환경, node_modules, 캐시, 원본/과거/대용량 정제 CSV, 로그, dist 등을 샘플 경로로 검사해 제외됨을 확인했고 `frontend/.env.example`과 작은 EV 등록 CSV는 제외되지 않음을 확인했다. `.gitignore`는 이미 추적된 파일을 자동 해제하지 않으므로 향후 index가 생기면 별도로 점검해야 한다.

**채택한 데이터 공급 방식:** 전체 정제 충전기 스냅샷은 승인된 별도 전달 경로로 공급하고 기존 프로젝트 상대 경로에 놓는다. 배포 시 같은 경로의 읽기 전용 볼륨으로 마운트하는 구성이 적합하다. 백엔드가 즉시 요구하는 파일은 `charger_info_clean.csv`, `ev_registration_by_region_2025.csv`, `charger_installation_trend.csv`, `reports/chart_verification.json`이며 PNG 조회에는 기존 `outputs/charts/`도 필요하다. 데이터 검증 보고서·SHA256과 기준일을 함께 전달한다. Git LFS나 외부 공개 다운로드 URL은 소유권·배포 정책이 확정되지 않아 설정하지 않았다.

확인 시점 [한국환경공단 공식 API 목록](https://www.data.go.kr/data/15076352/openapi.do)은 공공누리 제1유형 출처표시를 표시하고, 개발계정 트래픽 1,000 및 운영계정 증설 신청 안내를 제공한다. 이 사실만으로 원본 Excel 3개·가공 데이터·제3자 권리 전체를 무조건 공개 가능하다고 판단하지 않는다. **각 Excel 출처의 재배포 조건, 계정별 API 이용 승인·가이드, 가공물의 출처 표기 및 제3자 권리를 공개 전에 확인해야 한다.** 현재 대시보드 실행은 저장 CSV만 사용하므로 인증키나 공공 API 재호출이 필요 없다. 소스코드 라이선스는 소유자가 별도 선택해야 한다.

인증키 검사는 기존 `.env`의 실제 키와 URL 인코딩/디코딩 형태를 메모리에서만 비교했다. 원문이나 인증키 포함 URL을 출력하지 않았다. 알려지지 않은 모든 종류의 비밀정보를 탐지하는 완전한 DLP/커밋 이력 감사는 아니다.

## 5. Python 실행 환경과 이식성

백엔드는 파일 위치에 상대적인 프로젝트 루트를 사용하며 조회 코드에 작성자 PC 절대 경로가 필요하지 않다. CORS는 `CHARGE_GAP_CORS_ORIGINS`, 프론트 API 주소는 공개 설정인 `VITE_API_BASE_URL`로 지정한다. `VITE_*`에 인증키를 넣으면 안 된다. root collector도 자신의 파일 기준 루트를 사용하나 이번에는 실행하지 않았다.

기존 `requirements.txt`, backend 실행/개발 요구사항, 두 lock 파일, 그래프 전용 requirements를 확인했다. 현재 backend 환경의 고정 버전과 설치 버전이 일치하고 `pip check`가 정상이라 불필요하게 갱신하지 않았다. 수집/차트용 환경 전체를 새로 설치하지 않았으며 그래프 라이브러리나 PNG를 재생성하지 않았다. 고정 requirements가 있다고 다른 OS의 wheel 설치까지 검증된 것은 아니다.

남은 제한: `scripts/create_report_charts_v2.py:5` 기본 프로젝트 경로와 `:21`의 Malgun Gothic 폰트 경로가 Windows 전용이다. `--project-root`로 루트는 변경 가능하지만 폰트는 별도 처리해야 한다. 이는 웹 서버 실행에는 필요하지 않은 **보고서 PNG 재생성 시의 제한**이다. 현재 수정 허용 범위인 의존성·Git·실행 안내를 넘어 생성 코드를 바꾸거나 PNG를 다시 만들지 않았다. Linux/macOS 실행 명령과 필요한 데이터는 새 README에 추가했지만 새 OS/새 PC 설치 실측은 미확인이다.

## 6. 남은 필수 조건과 선택적 개선

### 외부 공개·배포 전에 필요한 조건

1. 데이터 재배포 조건과 출처·가공 사실 표시 확정. 작은 집계 CSV도 원본 이용 조건 검토 대상이다.
2. 별도 정제 데이터 전달/볼륨과 해시 검증 절차 확정. 소스 clone만으로는 API가 실행되지 않는다.
3. 업데이트 전 개발 서버가 실행 중이면 재시작. 새 Git index와 커밋 후보를 만들 때 제외·비밀정보 검사를 다시 수행.
4. 실제 배포 주소의 API URL, HTTPS, CORS, SPA fallback과 WSGI/정적 서버 구성 검증. Vite dev/preview 및 Flask 개발 서버를 운영 서버로 사용하지 않기.
5. Docker 단계에서는 Linux 기반 이미지에서 lock 설치·CSV 볼륨·한글 폰트·초기 메모리와 실행을 검증. 현재 이미지를 만들거나 검증한 상태가 아니다.

### 선택적 개선 및 알려진 제한

- **폰트 자산:** 빌드에 일부 IBM Plex Sans KR `.woff2` 경로 미해결 경고가 남았다. 브라우저에서도 OTS decode 경고가 관찰됐으며, 예시 자산 요청은 200이지만 `text/html`의 SPA fallback을 반환한다. 정상 폰트 파일 응답은 아니다. 현재 한글 텍스트는 대체 글꼴로 표시되며, 디자인 변경 금지 범위에 따라 CSS·폰트 경로는 고치지 않았다. 공개 품질을 위해 해당 import/자산 경로를 별도 정비하고 fallback 없이 확인할 것을 권장한다. 누적 브라우저 로그는 경고 144·오류 0이며 한 페이지만의 경고 개수는 아니다.
- **번들:** 기존 코드의 분할 설정이 유지돼 최종 최대 JS 청크 약 465.10kB로 700kB 설정 경고 미만이다. 이번에 디자인·청크 분할 코드를 새로 수정하지 않았다.
- **재현성:** OS가 다른 Python 그래프 재생성용 폰트 설정, 새 PC 설치 및 생산 환경 동시 사용자 부하는 미확인. 로컬 테스트 통과와 구분한다.
- **향후 보안:** audit 0은 영구 무취약 보장이 아니므로 배포 직전에 재감사하고 런타임 보안 지원 버전과 데이터 출처 조건을 다시 확인한다.

**GitHub 단계:** 소스·문서 정리와 후보 검토는 진행 가능하다. 공개 업로드는 라이선스/데이터 범위 확정과 실제 staging 목록 점검 뒤 진행해야 한다. 저장소 생성·push는 하지 않았다.  
**Docker 단계:** 구성 설계 단계로 진행 가능하다. 실제 이미지 제작·배포 승인은 이 보고서의 범위 밖이며 위 조건을 해결해야 한다. Docker 파일·이미지 빌드·배포는 하지 않았다.

## 7. 증거와 공개 후보 목록

검증 상세는 프로젝트 밖 `<이전 작업 폴더>\work\deployment_readiness`에 보존했다. `audit_before.json`, `audit_after.json`, `audit_production.json`, `typecheck.log`, `build.log`, `pytest.xml`, `pytest.log`, `python_dependencies.json`, `verification.json`, `browser_results.json`, `font_check.json`, 해시 baseline과 공개 후보 목록이다. 인증키 값은 저장하지 않았다. 이 임시 증거 폴더는 제출 프로젝트 파일 목록에 섞지 않았다.

아래 217개는 이 보고서까지 포함한 제외 규칙 적용 후보다. 데이터 및 보고서의 이용 조건·개인 경로 표기 검토 후 최종 공개 범위를 결정한다.

```text
.gitignore
README.md
backend/.gitignore
backend/API_SPEC.md
backend/README.md
backend/chargegap_api/__init__.py
backend/chargegap_api/data.py
backend/chargegap_api/routes.py
backend/chargegap_api/validation.py
backend/docs/history/pre_station_size/API_SPEC.md
backend/docs/history/pre_station_size/openapi.json
backend/examples/charger-output.json
backend/examples/charger-regions.json
backend/examples/charger-types.json
backend/examples/charts.json
backend/examples/ev-registration.json
backend/examples/growth.json
backend/examples/locations.json
backend/examples/operators.json
backend/examples/overview.json
backend/examples/station-size-distribution-filtered.json
backend/examples/station-size-distribution.json
backend/openapi.json
backend/requirements-dev.txt
backend/requirements.lock.txt
backend/requirements.txt
backend/run.py
backend/tests/conftest.py
backend/tests/test_api.py
backend/tests/test_station_size.py
backend/verification/TEST_REPORT.md
backend/verification/http_smoke.json
backend/verification/preserved_files.json
backend/verification/pytest_results.xml
backend/verification/station_size_v2/performance.json
backend/verification/station_size_v2/preserved_files.json
backend/verification/station_size_v2/pytest.xml
collector.py
data/checkpoints/manifest.json
data/checkpoints/page_000001.json
data/checkpoints/page_000002.json
data/checkpoints/page_000003.json
data/checkpoints/page_000004.json
data/checkpoints/page_000005.json
data/checkpoints/page_000006.json
data/checkpoints/page_000007.json
data/checkpoints/page_000008.json
data/checkpoints/page_000009.json
data/checkpoints/page_000010.json
data/checkpoints/page_000011.json
data/checkpoints/page_000012.json
data/checkpoints/page_000013.json
data/checkpoints/page_000014.json
data/checkpoints/page_000015.json
data/checkpoints/page_000016.json
data/checkpoints/page_000017.json
data/checkpoints/page_000018.json
data/checkpoints/page_000019.json
data/checkpoints/page_000020.json
data/checkpoints/page_000021.json
data/checkpoints/page_000022.json
data/checkpoints/page_000023.json
data/checkpoints/page_000024.json
data/checkpoints/page_000025.json
data/checkpoints/page_000026.json
data/checkpoints/page_000027.json
data/checkpoints/page_000028.json
data/checkpoints/page_000029.json
data/checkpoints/page_000030.json
data/checkpoints/page_000031.json
data/checkpoints/page_000032.json
data/checkpoints/page_000033.json
data/checkpoints/page_000034.json
data/checkpoints/page_000035.json
data/checkpoints/page_000036.json
data/checkpoints/page_000037.json
data/checkpoints/page_000038.json
data/checkpoints/page_000039.json
data/checkpoints/page_000040.json
data/checkpoints/page_000041.json
data/checkpoints/page_000042.json
data/checkpoints/page_000043.json
data/checkpoints/page_000044.json
data/checkpoints/page_000045.json
data/checkpoints/page_000046.json
data/checkpoints/page_000047.json
data/checkpoints/page_000048.json
data/checkpoints/page_000049.json
data/checkpoints/page_000050.json
data/checkpoints/page_000051.json
data/checkpoints/page_000052.json
data/checkpoints/page_000053.json
data/processed/charger_by_region.csv
data/processed/charger_coordinate_issues.csv
data/processed/charger_duplicate_rows.csv
data/processed/charger_identity_issues.csv
data/processed/charger_installation_trend.csv
data/processed/charger_operator_summary.csv
data/processed/charger_output_summary.csv
data/processed/charger_region_output_excel.csv
data/processed/charger_region_summary.csv
data/processed/charger_type_summary.csv
data/processed/ev_registration_by_region_2025.csv
data/processed/region_comparison_2025_registration_2026_chargers.csv
frontend/.env.example
frontend/.gitignore
frontend/README.md
frontend/docs/CHART_PLAN.md
frontend/index.html
frontend/package-lock.json
frontend/package.json
frontend/public/favicon.svg
frontend/src/App.tsx
frontend/src/analysis/insights.tsx
frontend/src/api/client.ts
frontend/src/api/endpoints.ts
frontend/src/api/hooks.ts
frontend/src/api/types.ts
frontend/src/charts/BoxPlot.tsx
frontend/src/charts/ColumnChart.tsx
frontend/src/charts/CommercialDotPlot.tsx
frontend/src/charts/CumulativeChart.tsx
frontend/src/charts/DonutChart.tsx
frontend/src/charts/DotPlot.tsx
frontend/src/charts/HBarChart.tsx
frontend/src/charts/Heatmap.tsx
frontend/src/charts/HistKde.tsx
frontend/src/charts/OperatorTreemap.tsx
frontend/src/charts/RegionScatter.tsx
frontend/src/charts/StackedHBar.tsx
frontend/src/charts/Tooltip.tsx
frontend/src/charts/theme.ts
frontend/src/components/DataNotes.tsx
frontend/src/components/FilterBar.tsx
frontend/src/components/ReportGallery.tsx
frontend/src/components/StationMap.tsx
frontend/src/components/layout/AppShell.tsx
frontend/src/components/ui/Card.tsx
frontend/src/components/ui/ChartDetail.tsx
frontend/src/components/ui/DataTable.tsx
frontend/src/components/ui/Icon.tsx
frontend/src/components/ui/Insight.tsx
frontend/src/components/ui/Modal.tsx
frontend/src/components/ui/OperatorPicker.tsx
frontend/src/components/ui/QueryState.tsx
frontend/src/features/ChartCards.tsx
frontend/src/lib/format.ts
frontend/src/lib/motion.tsx
frontend/src/lib/stats.ts
frontend/src/main.tsx
frontend/src/pages/ChargingInfrastructure.tsx
frontend/src/pages/EvRegistration.tsx
frontend/src/pages/GrowthTrends.tsx
frontend/src/pages/Overview.tsx
frontend/src/pages/RegionalExplorer.tsx
frontend/src/state/filters.ts
frontend/src/styles/global.css
frontend/src/styles/tokens.css
frontend/tsconfig.json
frontend/vite.config.ts
outputs/charts/01_ev_registration_top10.png
outputs/charts/02_ev_vehicle_type_donut.png
outputs/charts/03_ev_commercial_stacked.png
outputs/charts/04_chargers_by_region.png
outputs/charts/05_station_location_scatter.png
outputs/charts/06_charger_type_pie.png
outputs/charts/07_charger_output_histogram.png
outputs/charts/08_operator_chargers_top10.png
outputs/charts/09_annual_charger_installation_trend.png
outputs/charts/10_regional_output_heatmap.png
outputs/charts_v2_report/v2_01_ev_top10.png
outputs/charts_v2_report/v2_02_vehicle_donut.png
outputs/charts_v2_report/v2_03_commercial_percent.png
outputs/charts_v2_report/v2_04_stations_chargers_regression.png
outputs/charts_v2_report/v2_05_station_size_boxplot.png
outputs/charts_v2_report/v2_06_type_top4_donut.png
outputs/charts_v2_report/v2_07_output_histogram_kde.png
outputs/charts_v2_report/v2_08_regional_output_heatmap.png
outputs/charts_v2_report/v2_09_cumulative_installation_area.png
outputs/charts_v2_report/v2_10_operator_treemap.png
reports/backend_visualization_v2_validation.json
reports/backend_visualization_v2_validation.md
reports/chart_analysis.md
reports/chart_data_summary.md
reports/chart_final_validation.json
reports/chart_final_validation.md
reports/chart_v2_analysis.md
reports/chart_v2_api_inputs.json
reports/chart_v2_data_summary.md
reports/chart_v2_verification.json
reports/chart_verification.json
reports/collection_report.md
reports/data_integration_plan.md
reports/data_quality_report.md
reports/dataset_analysis.md
reports/dataset_preparation_saved_file_checks.json
reports/dataset_preparation_verification.json
reports/deployment_readiness_report.md
reports/final_project_validation.md
reports/history/20261015T041856969020_collection_metrics.json
reports/history/20261015T041856969020_previous.md
reports/history/20261015T042133887931_collection_metrics.json
reports/history/20261015T042133887931_previous_collection_report.md
reports/history/20261015T042133887931_previous_data_quality_report.md
reports/history/20261015T042133887931_previous_saved_file_verification.json
reports/history/dataset_preparation_saved_file_checks_incomplete.json
reports/saved_file_verification.json
reports/station_size_api_handoff.md
reports/tests/20261015T041629636945/response.xml
reports/tests/20261015T041629636945/sample.csv
reports/tests/20261015T041856969020/response.xml
reports/tests/20261015T041856969020/sample.csv
requirements.lock.txt
requirements.txt
scripts/create_report_charts_v2.py
scripts/requirements-charts-v2.txt
test_collector.py
```

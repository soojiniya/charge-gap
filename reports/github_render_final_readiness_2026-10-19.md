# GitHub 최종 반영 준비 및 Render 설정 검증

확인일: 2026-10-19. **GitHub 코드 반영 준비 PASS / 실제 인터넷 공개 배포 CONDITIONAL PASS**.

앱 코드·데이터 정확성과 제한 환경의 R2 다운로드는 통과했다. 공개 전 필수로 남은 것은 EV/growth 자료의 개별 이용 조건과 실제 Render URL/HTTPS 연동 검증이다. Git stage·commit·push, Render 서비스 생성·배포, R2 수정은 수행하지 않았다.

## 1. Git 상태와 반영 범위

- 브랜치 `main`, HEAD `eb1810eede2e276c1715caef7e30a25372929ce9`. 기존 Private 저장소 정책을 유지한다. 원격 fetch·GitHub 서버 privacy 재조회는 이번 범위에서 수행하지 않았으므로 로컬 origin/main 표시는 마지막 fetch 기준이다.
- 현재 추적 155개, 신규 후보 20개, 합계 **175개**. 추적 파일 중 변경 3개, 변경/신규 합계 **23개**다. 기존 PNG·보고서도 후보 전체 목록에 포함되며 이번에 재생성하지 않았다.
- staging 항목 **0개**. 목록은 승인 후 검토할 후보이지 이번 작업에서 업로드한 파일이 아니다.
- 데이터·원본 Excel·CSV·R2 인증정보는 후보에 없다. 모든 후보는 50MiB 이하임을 확인했다. 정확한 크기·SHA는 로컬 Git 제외 `work/github-render-final-prep/upload_candidate_manifest.json`에 저장한다.

변경된 추적 파일:

- `.gitignore`
- `README.md`
- `backend/chargegap_api/data.py`

신규 반영 후보:

- `backend/chargegap_api/file_cache.py`
- `backend/tests/test_file_cache.py`
- `backend/tests/test_memory_regression.py`
- `deploy/render/Dockerfile`
- `deploy/render/Dockerfile.dockerignore`
- `deploy/render/data-manifest.json`
- `deploy/render/download_data.py`
- `deploy/render/frontend.env.example`
- `deploy/render/start.py`
- `deploy/render/tests/test_deployment.py`
- `docs/DATA_SOURCE_RIGHTS.md`
- `docs/RENDER_DEPLOYMENT.md`
- `render.yaml`
- `reports/backend_memory_optimization.md`
- `reports/github_render_final_readiness_2026-10-19.md`
- `reports/linux_container_memory_test_2026-10-18.md`
- `reports/r2_cache_memory_optimization_2026-10-19.md`
- `reports/r2_readonly_startup_validation_2026-10-19.md`
- `reports/r2_upload_report_2026-10-19.md`
- `reports/render_deployment_preparation.md`

최종 준비 작업의 변경은 `.gitignore`, README, 배포 문서, render.yaml의 빈 prefix 지정 및 신규 출처 문서/이 보고서다. DataStore·file_cache·다운로더·테스트는 앞선 최적화 결과를 재검증했으며 이번에는 바꾸지 않았다. 기존 과거 보고서는 작성 당시 상태를 기록한 문서이므로 수정하지 않고 최신 문서로 연결했다.

## 2. 비밀정보 및 제외 확인

`.env`, `work/r2-upload/credentials.env`, 가상환경, node_modules, 캐시·로그·임시 파일 및 모든 CSV/Excel은 Git 제외 대상이다. 기존 credentials.env는 work/ 규칙으로 제외됐고 이번에 `credentials*.env`도 추가해 위치에 관계없이 제외하도록 보강했다. 이미 추적된 민감 경로·CSV·Excel은 없으며, `.gitignore`가 이미 추적된 파일을 자동 제거한다고 가정하지 않았다.

후보 전체 텍스트에서 현재 R2 access/secret/endpoint·계정 식별 문자열과 수집용 .env 인증키(존재 시)의 실제 값, 명백한 GitHub 토큰/개인키 패턴을 확인했다. 최종 검사 결과는 별도 evidence JSON에 기록하며 실제 값은 출력하지 않는다. 이 검사는 현재 Git 후보에 대한 검사로 전체 역사·모든 형식의 비밀정보를 완전 탐지한다고 보장하는 감사는 아니다.

R2 bucket은 private 유지, 업로드 토큰은 사용자에 의해 폐기, 현재 런타임은 버킷 한정 읽기 전용이라는 설정을 유지한다. 관리 영역 상태를 객체 읽기 토큰으로 독립 검증한 것으로 기록하지 않는다. 이미지에는 CSV/PNG/인증정보를 넣지 않는다. 데이터는 GitHub clone만으로 공급되지 않는다.

## 3. Render Docker 코드 반영

Dockerfile `deploy/render/Dockerfile`은 `backend/chargegap_api/`를 복사한다. 전용 ignore의 `!backend/chargegap_api/*.py`가 신규 `file_cache.py`를 포함하며 DataStore가 `open_snapshot`을 호출한다. deploy/render/download_data.py의 bounded writeback/hash 로직은 Dockerfile의 별도 COPY에 포함된다. 이 세 파일의 경로·import/COPY 연결과 현재 소스 해시를 확인했다.

실제 제한 시험에 성공한 이미지 ID는 `sha256:3e2b8d462cf33c3e36aa459b4246dd531d227389b53b53eebcd5e28844170dd9`다. 14개 R2 파일과 SHA, API 96/96, 최고 426.184MiB, 여유 85.816MiB, max/oom/oom_kill=0, OOMKilled=false, 재시작 0회, 준비 74.078초였다. 전후 Linux 응답 96개도 동일하다. [실측 보고서](r2_cache_memory_optimization_2026-10-19.md).

현재 코드는 이 시험 뒤 변경되지 않았고 빌드 입력/COPY 경로와 테스트를 확인했다. 다만 Codex의 Docker 엔진 접근은 거부되어 이번 턴에 이미지 내부 파일 해시를 다시 추출한 것은 아니다. 이 구분은 테스트 이미지 기능 검증과 별개다. 로컬 Compose/Dockerfile·포트 18080은 바꾸지 않았다.

## 4. 재실행한 테스트

| 검증 | 결과 |
| --- | --- |
| Flask/backend + 배포 테스트 | **118 passed in 16.54s** |
| React TypeScript | `npm.cmd run typecheck` 성공 |
| React production build | HTTPS API origin을 넣은 `vite build` 성공, 791 modules, 7.90초 |
| Node/npm | 24.21.0 / 11.19.0 |
| package.json/lock | dependencies·devDependencies·engines 일치 |
| 실제 R2 제한 환경 시험 | 직전 완료 PASS 결과 재확인. 추가 다운로드/컨테이너 재시험 불필요하여 반복하지 않음 |
| 데이터 보존 | 원본 14개 크기·SHA 일치; 보호 기준 210개 중 문서/설정 4개만 허용 변경 |

빌드 출력은 `work/github-render-final-prep/frontend-dist`로 분리해 기존 dist를 교체하지 않았다. package.json에 React 단위/E2E `test` 스크립트가 없어 이를 실행했다고 표현하지 않는다. 이번 턴에는 5개 페이지 브라우저 회귀나 실제 Render HTTPS 접속을 다시 수행하지 않았다. 앱·UI 코드 변경은 없다.

중단 후 이어받기에서는 위 통과 결과와 저장된 파일 해시를 재확인했다. 175개 후보 중 앱·테스트·프론트엔드 빌드 입력이 그대로임을 확인해 테스트·빌드·R2 다운로드를 불필요하게 반복하지 않았다. README의 이전 110개 표기를 최신 118개로 정정하고 이 보고서에 연결했다. 실제 비밀값을 출력하지 않는 후보 검사, 원본 14개 SHA-256 및 빈 R2 prefix 검증도 다시 통과했다.

빌드 후 CSS 검사에서 **존재하지 않는 한글 폰트 상대 URL 558개**를 확인했다. 모두 ibm-plex-sans-kr 파일 참조다. unicode-range/실제 글자에 따라 요청되므로 558개가 모두 동시에 요청된다는 뜻은 아니다. 일부 글자는 시스템 fallback으로 표시될 수 있어 build 성공과 폰트 자산 완전성을 구분해야 한다. 폰트/UI는 이번에 수정하지 않았다. 공개 URL에서 404·가독성을 확인하고 필요시 별도 폰트 경로 보완이 필요하다.

## 5. Render Free 환경변수·데이터 설정

| 위치 | 이름/설정 | 확정 규칙 |
| --- | --- | --- |
| API 서버 | PORT | Render 제공; 0.0.0.0, 기본값 10000 |
| API 서버 | CHARGE_GAP_CORS_ORIGINS | 실제 Static Site HTTPS origin, 끝 /·경로 없음 |
| API 서버 | CHARGE_GAP_S3_ENDPOINT | R2 HTTPS origin, 서버 비밀 설정에서만 입력 |
| API 서버 | CHARGE_GAP_S3_BUCKET | 승인된 비공개 버킷, 서버 설정에서 입력 |
| API 서버 | CHARGE_GAP_S3_PREFIX | **빈 문자열**, 현재 버킷 루트 객체 경로와 일치 |
| API 서버 | CHARGE_GAP_S3_REGION | auto |
| API 서버 | CHARGE_GAP_S3_ACCESS_KEY_ID | 버킷 한정 읽기 전용, 실제 값 비공개 |
| API 서버 | CHARGE_GAP_S3_SECRET_ACCESS_KEY | 읽기 전용 비밀값, 프론트엔드 전달 금지 |
| API 서버 | CHARGE_GAP_S3_SESSION_TOKEN | 발급한 경우에만 추가, 현재 기본 Blueprint에는 없음 |
| Static 빌드 | VITE_API_BASE_URL | 실제 API HTTPS origin, /api를 붙이지 않음 |
| Static 빌드 | NODE_VERSION | 24 |

기존 로컬 읽기 설정의 필수값·region=auto·prefix 빈 값은 코드의 검증에 통과했다. 실제 값은 보고서에 복사하지 않는다. 이번 render.yaml 변경은 PREFIX의 `sync: false` 입력 요청을 `value: ''`로 바꾼 것뿐이다. 민감한 endpoint·bucket·keys는 여전히 sync:false다. 코드가 default 빈 prefix를 처리하므로 수동 설정에서 PREFIX를 생략해도 같은 객체 경로를 사용한다.

Blueprint API는 runtime Docker, plan free, root context `.`, Dockerfile deploy/render/Dockerfile, health /api/charts, 자동 배포 off다. CMD를 덮어쓰지 않는다. Waitress 1스레드와 BLAS/OMP/MKL/NUMEXPR/VECLIB/BLIS 1스레드는 이미지/실행 코드가 강제한다. Static은 frontend, build `npm ci && npm run build`, publish dist, `/*` → `/index.html` rewrite다. 실제 Render Blueprint 서버 측 적용 검증은 아직 하지 않았다.

manifest 14개, 242,521,708 bytes를 시작할 때 비공개 R2에서 검증 다운로드한다. 이 공급 경로는 승인된 서버용이고 브라우저에 R2 URL/자격증명을 내려주지 않는다. 수집 인증키는 런타임에 필요 없다. API 출처/날짜는 기존대로 EV=2025-12, 충전기=2026-10-15, growth 2026=부분 연도다.

## 6. 공식 출처와 이용 조건

[별도 확인 기록](../docs/DATA_SOURCE_RIGHTS.md)에 URL과 표기 예를 정리했다.

- EV: 국토교통부 자동차등록현황보고의 공식 페이지에서 해당 2025-12 첨부 목록을 확인했다. 통계누리의 일반 정책도 찾았지만 로컬 파일의 최초 다운로드 연결과 해당 첨부의 공공누리 표시까지 확보하지 못했으므로 **개별 공개 조건 확인 필요**다.
- growth: 무공해차 통합누리집 공식 대응 표의 연간·누적 32개 값이 일치한다. 공개자료 목록의 제1유형을 이 대시보드 Excel에 자동 확대 적용하지 않는다. **해당 표에 직접 적용되는 이용 조건은 미확정**이다.
- API: 공공데이터포털 HTML의 출처표시 제1유형을 재확인했다. 기존 원문 링크·기준일·정제/집계 사실 표시를 유지한다.

출처 URL을 찾았다는 사실은 개별 자료의 이용 허락 완료와 다르다. 비공개 저장소에서 내려받더라도 인터넷 API/PNG로 수치를 제공하므로 미확정 상태의 공개는 이용 조건 위반·출처 오표기 위험이 있다. 최초 다운로드 일자/정확한 마감일을 만들어 표기하지 않는다. 데이터/그래프/UI 및 기존 보고서를 임의로 고쳐 이를 해결한 것으로 처리하지 않았다.

## 7. 승인 후 예상 절차

1. 사용자 승인 후 아래 후보 중 이번 변경/신규 파일을 명시적으로 stage하고 cached diff·비밀정보·제외 목록을 다시 확인한다. 현재는 stage하지 않았다.
2. 승인한 내용으로 commit/push하고 Private 저장소를 유지한다. GitHub 접근 권한은 필요한 저장소로 제한하며 CSV·Excel·인증정보를 포함하지 않는다.
3. 인터넷 공개 전 개별 자료의 공공누리 표시/제공기관 안내와 실제 웹·API·PNG의 출처 표기를 확정한다. 현재 확인되지 않은 권리는 미확정으로 유지한다. Private GitHub 코드 반영 준비 PASS가 공개 데이터 이용 허가를 뜻하지 않는다.
4. Free Docker Web Service와 Static Site를 만들고 위 환경변수를 입력한다. 자동 배포 off, 유료 인스턴스/디스크 없음, Docker CMD 유지. 아직 생성하지 않는다.
5. 실제 두 HTTPS origin을 얻어 API CORS와 Vite build 값에 교차 설정하고 프론트엔드를 빌드한다. 잠정 origin을 쓴다면 실제 값으로 바꾼 뒤 해당 서비스를 수동 재배포한다.
6. 로그에 비밀값이 없는지 확인하고 health·overview·10개 API·복합 필터·지도·PNG·SPA 직접 접근·한글 폰트·모바일과 cold start를 검증한다.
7. 토큰 6개월 만료 전 교체, 비용 알림/사용량을 점검한다. Render 유휴 종료 후 임시 파일 소실 및 231MiB 재다운로드 지연을 안내한다. R2 $1 알림은 비용 상한이 아니다.

실제 가입/과금/서비스 설정과 검증은 다음 승인된 단계의 일이다. Render 무료 서비스의 유휴 종료·임시 파일 소실·월간 한도는 [공식 Free 문서](https://render.com/docs/free), Blueprint 설정은 [공식 명세](https://render.com/docs/blueprint-spec)를 따른다. 무료 운영의 무중단·무제한·성능을 보장하지 않는다.

## 8. 전체 GitHub 후보 파일 목록

총 175개. 아래는 현재 index/기존 추적 파일과 Git 제외되지 않은 신규 파일의 합집합이며, 원격에 새로 전송할 파일 개수와 같지 않다. 실제 변경/신규는 23개다. 이 목록 생성 후 새로운 파일이 생기면 재검토한다.

```text
.dockerignore
.gitignore
README.md
backend/.gitignore
backend/API_SPEC.md
backend/Dockerfile
backend/README.md
backend/chargegap_api/__init__.py
backend/chargegap_api/data.py
backend/chargegap_api/file_cache.py
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
backend/requirements.docker.txt
backend/requirements.lock.txt
backend/requirements.txt
backend/run.py
backend/tests/conftest.py
backend/tests/test_api.py
backend/tests/test_file_cache.py
backend/tests/test_memory_regression.py
backend/tests/test_station_size.py
backend/verification/TEST_REPORT.md
backend/verification/http_smoke.json
backend/verification/preserved_files.json
backend/verification/pytest_results.xml
backend/verification/station_size_v2/performance.json
backend/verification/station_size_v2/preserved_files.json
backend/verification/station_size_v2/pytest.xml
collector.py
compose.yaml
deploy/render/Dockerfile
deploy/render/Dockerfile.dockerignore
deploy/render/data-manifest.json
deploy/render/download_data.py
deploy/render/frontend.env.example
deploy/render/start.py
deploy/render/tests/test_deployment.py
docker/VALIDATION.md
docs/DATA_SOURCE_RIGHTS.md
docs/GITHUB_READINESS.md
docs/RENDER_DEPLOYMENT.md
frontend/.env.example
frontend/.gitignore
frontend/Dockerfile
frontend/README.md
frontend/docs/CHART_PLAN.md
frontend/index.html
frontend/nginx.conf
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
render.yaml
reports/backend_memory_optimization.md
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
reports/github_render_final_readiness_2026-10-19.md
reports/history/20261015T041856969020_collection_metrics.json
reports/history/20261015T041856969020_previous.md
reports/history/20261015T042133887931_collection_metrics.json
reports/history/20261015T042133887931_previous_collection_report.md
reports/history/20261015T042133887931_previous_data_quality_report.md
reports/history/20261015T042133887931_previous_saved_file_verification.json
reports/history/dataset_preparation_saved_file_checks_incomplete.json
reports/linux_container_memory_test_2026-10-18.md
reports/r2_cache_memory_optimization_2026-10-19.md
reports/r2_readonly_startup_validation_2026-10-19.md
reports/r2_upload_report_2026-10-19.md
reports/render_deployment_preparation.md
reports/saved_file_verification.json
reports/station_size_api_handoff.md
requirements.lock.txt
requirements.txt
scripts/create_report_charts_v2.py
scripts/requirements-charts-v2.txt
test_collector.py
```

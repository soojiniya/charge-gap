# CHARGE GAP GitHub 공개 준비 점검

점검일: 2026-10-17 (KST)  
대상: `C:\Users\User\Documents\Codex\CHARGE GAP`

**판정: 기술적 공개 준비 완료 / 실제 공개는 조건부.** 인증키·의존성·원본 데이터 제외와 실행 안내는 정비했다. 데이터·PNG·보고서의 재배포 권리, 별도 데이터 전달 경로, 코드 라이선스는 소유자가 확정해야 한다. 후보 목록은 법적 공개 승인이나 실제 Git staging 목록이 아니다.

## 1. Git 및 작업 범위

프로젝트 `.git`가 없고 `git rev-parse --show-toplevel`도 저장소가 아니라는 결과를 반환했다. 이번에 Git을 초기화하거나 GitHub 저장소를 생성하지 않았다. add·commit·push도 수행하지 않았다. 제외 규칙은 이전 작업에서 프로젝트 밖에 만든 검증 전용 Git 메타데이터로 실제 Git ignore 동작을 확인했다. 프로젝트 폴더에는 Git 메타데이터를 만들지 않았다. 따라서 실제 index·과거 커밋의 비밀정보 검사는 할 대상이 없으며, 향후 staging 뒤 재점검이 필요하다.

변경한 기존 파일은 `.gitignore`, `.dockerignore`, `README.md`, `docker/VALIDATION.md` 4개다. 이 점검 문서가 신규 파일이다. `compose.yaml`은 이미 `127.0.0.1:18080:80`이어서 변경하지 않았다. 기존 파일 236개 중 위 4개를 제외한 **232개 SHA256이 동일**하다. 데이터·PNG·기존 `reports/`·백엔드/프론트엔드 기능·디자인·애니메이션 코드는 보존했다. 가상환경·node_modules·빌드 캐시 등 생성물은 원본 보존 해시의 대상에서 제외했다.

## 2. 최종 제외 규칙과 보안 검사

| 종류 | Git 처리 | Docker 빌드 처리 |
|---|---|---|
| `.env`, `.env.*` | 제외. 비밀값 없는 `.env.example` 예외 | 모두 제외 |
| 개인키·자격증명 JSON·service/api key 파일·secrets 폴더 | 제외 | 소스 허용 목록과 추가 제외 규칙으로 차단 |
| `.npmrc`, `.pypirc` | 제외 | 제외 |
| 가상환경·node_modules·Python 캐시 | 제외 | 제외 |
| CSV·Excel | 크기와 무관하게 모두 제외 | 모두 제외 |
| 원본·과거 스냅샷 | 제외 | 기본 전체 제외로 차단 |
| 로그·임시·백업·빌드 파일 | 제외 | 기본 제외 및 소스 폴더 안 추가 차단 |
| source/config/test/docs | 공개 후보 | 필요한 빌드 코드·설정만 허용 |
| 기존 PNG·보고서 메타데이터·분석 문서 | 공개 후보, 권리·내용 검토 필요 | 이미지에 포함하지 않음 |

기존에는 작은 집계 CSV가 후보였지만, 이번에는 **재배포 조건 미확정에 맞춰 작은 집계 CSV까지 제외**했다. 대시보드의 별도 데이터 공급 방식과 필요한 경로를 먼저 확인한 뒤 적용했다. 데이터를 삭제하지 않았으며 기존 로컬 실행과 Docker 마운트에는 영향이 없다.

Git으로 `.env`, 하위 `.env.production`, `.venv`, node_modules, `__pycache__`, 원본·정제·작은 집계 CSV, Excel, log, dist, tsbuildinfo, tmp, credentials, service_key, secrets, `.npmrc` 샘플 경로가 제외됨을 확인했다. `.env.example`, Compose, PNG 경로는 후보에 남는 것도 확인했다.

공개 후보 **211개**에서 설정된 API 키의 원문·URL 인코딩/디코딩 형태와 일반적인 private key/GitHub token/AWS access ID 패턴을 검사해 일치 0건이었다. 검사 중 인증키 원문·값이 포함된 URL을 출력하거나 보고서에 저장하지 않았다. 인증키 파일 자체도 작업 시작 해시와 같으며 수정하지 않았다. `.env.example`에는 공개 API 주소·타일 설정 예시만 있다. 알려지지 않은 모든 비밀정보의 탐지나 과거 커밋 감사까지 보장하는 결과는 아니다.

후보 중 50MB 초과 파일은 0개다. `node_modules`, `.venv`, 생성된 dist 등은 후보에 없고, 대용량 CSV뿐 아니라 모든 CSV·Excel이 제외됐다. `.gitignore`는 미래에 이미 추적된 파일을 자동 해제하지 않으므로 실제 staging을 만든 뒤 목록과 비밀정보를 다시 확인해야 한다.

## 3. 데이터 없이 clone한 경우

**소스만으로 실행 불가.** 아래 CSV 3개를 권한 있는 별도 경로로 제공받아야 한다. 해당 전달 URL·담당자·배포 방식은 아직 미확정이며, 이 문서는 공개 다운로드 경로를 제공하지 않는다. 데이터 재수집도 하지 않았다.

| 필요한 로컬 파일 | 바이트 | 현재 스냅샷 SHA256 |
|---|---:|---|
| `data/processed/charger_info_clean.csv` | 240,535,251 | `6cf8e89777a7720fdbb9f6800e555424896d870c4f45a6c5bde2f8012c5d00dd` |
| `data/processed/ev_registration_by_region_2025.csv` | 3,158 | `2be3140319d5cc20766e598cba8f356c577b986d4ce4d3134c9f4dad8bfef075` |
| `data/processed/charger_installation_trend.csv` | 2,353 | `7bf139ea609e6b4b7084e0a1aac65ed687f10b9094e4aee6b00697c8edd8e976` |

`reports/chart_verification.json`과 `outputs/charts/`의 PNG 10개도 필요하며 현재 후보 목록에는 포함한다. 이들 역시 최종 공개 권리 검토를 통과한 뒤 포함 범위를 확정해야 한다. 별도 데이터는 같은 파일명·구조로 배치하고 해시·기준일을 확인한다. 자료가 없으면 시작에 실패하며 가짜 데이터를 만들어 대체하지 않는다. 기본 웹 실행에는 CSV 3개가 필요하지만, 수집/정제 재현·전체 테스트·추가 분석에는 다른 로컬 데이터가 필요할 수 있다.

API 목록의 출처표시 안내만으로 원본 Excel 3개와 가공 CSV·PNG·보고서의 재배포를 일괄 승인하지 않았다. 각 원본 이용 조건·제3자 권리·출처 및 가공 사실 표기를 확인해야 한다. 저장소 코드 라이선스도 임의로 생성하지 않았다. **실제 공개 전에 권리 검토와 데이터 전달 정책을 확정해야 한다.**

## 4. Docker 및 실행 안내

현재 Compose의 호스트 바인딩은 `127.0.0.1:18080:80`이고 backend는 호스트에 직접 노출되지 않는다. README와 Docker 안내의 현재 실행 주소·curl 예시는 모두 18080이다. 기존 `reports/`에 남은 예전 8080·미검증 표시는 당시 이력으로 보존했다.

사용자가 2026-10-17 전달한 결과: 이미지 2개 빌드 성공, backend·frontend Healthy, `http://localhost:18080` 접속, 실제 KPI·그래프·필터·지도 정상, `docker compose down` 정상 종료. 이 결과를 사용자 확인 사항으로 명시했으며 이번에 Docker를 재실행하거나 새 로그·이미지 digest를 수집하지 않았다.

React production build → Nginx의 `/backend/` → Waitress로 동일 origin 통신한다. 빌드의 `VITE_API_BASE_URL=/backend`와 기존 API 응답 구조는 그대로다. CSV·PNG·메타데이터는 읽기 전용 마운트이며 `.env`를 마운트하거나 인증키를 전달하지 않는다. 데이터는 이미지에 없으므로 이미지만 전달받아도 별도 데이터 준비가 필요하다.

README는 프로젝트 소개·5개 페이지·10개 그래프·출처·기준 시점·기능·기술·개발/Docker 실행·종료·공급 미확정을 정리했다. 상대 문서 링크의 존재와 Compose 포트 일치를 확인했다. 이번은 문서·제외 규칙 작업이므로 이전에 통과한 Flask 82개·TypeScript·production build를 다시 실행하지 않았다. 기능 코드와 관련 설정은 해시로 보존을 확인했다.

## 5. 공개 전 남은 결정

1. 원본과 파생 자료의 이용 조건 및 공개 범위 확정. PNG·분석 문서도 검토 대상.
2. 실행 필수 CSV 3개의 승인된 전달 방법·담당자·검증 절차 확정.
3. 코드 공개 라이선스와 최종 문서·작성자 PC 경로 등 개인 표기의 공개 범위 결정.
4. 사용자가 승인한 뒤 Git 초기화·staging을 수행하고, 실제 목록·비밀정보·대용량 파일을 다시 점검.

GitHub 저장소 생성·commit·push와 공개 이미지 업로드는 수행하지 않았다. Docker 빌드·UI 변경·데이터 수집·전처리·PNG 재생성도 이번 범위에서 하지 않았다.

## 6. 실제 로컬 데이터 제외 목록

다음은 현재 있는 CSV·Excel 중 제외되는 파일이다. 가상환경·의존성·로그·캐시 등 대량 생성물은 위 분류로 별도 제외된다.

```text
data/processed/charger_by_region.csv
data/processed/charger_coordinate_issues.csv
data/processed/charger_duplicate_rows.csv
data/processed/charger_identity_issues.csv
data/processed/charger_info_clean.csv
data/processed/charger_installation_trend.csv
data/processed/charger_operator_summary.csv
data/processed/charger_output_summary.csv
data/processed/charger_region_output_excel.csv
data/processed/charger_region_summary.csv
data/processed/charger_type_summary.csv
data/processed/ev_registration_by_region_2025.csv
data/processed/history/20261015T042133887931/charger_by_region.csv
data/processed/history/20261015T042133887931/charger_coordinate_issues.csv
data/processed/history/20261015T042133887931/charger_duplicate_rows.csv
data/processed/history/20261015T042133887931/charger_identity_issues.csv
data/processed/history/20261015T042133887931/charger_info_clean.csv
data/processed/region_comparison_2025_registration_2026_chargers.csv
data/raw/2025년_12월_자동차_등록자료_통계.xlsx
data/raw/charger_info_raw.csv
data/raw/우리 지역 급속 충전 여건_2026-10-15.xlsx
data/raw/충전기 설치 성장 추세_2026-10-15.xlsx
reports/tests/20261015T041629636945/sample.csv
reports/tests/20261015T041856969020/sample.csv
```

## 7. 공개 후보 전체 목록 (211개)

현재 ignore 규칙을 적용한 후보이며 실제 Git index는 아니다. 이 문서 자신도 포함한다. 권리·비밀정보·개인 표기 검토를 거쳐 최종 업로드 범위를 결정한다.

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
docker/VALIDATION.md
docs/GITHUB_READINESS.md
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
reports/tests/20261015T041856969020/response.xml
requirements.lock.txt
requirements.txt
scripts/create_report_charts_v2.py
scripts/requirements-charts-v2.txt
test_collector.py
```

상세 검증 증거는 프로젝트 밖 `C:\Users\User\Documents\Codex\2026-10-15\charge-gap-python-api-csv-api\work\github_readiness`의 `verification.json`, `public_candidates.txt`, `baseline.json`에 저장했다. 키 값은 저장하지 않았다.

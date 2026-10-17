# 백엔드·시각화 v2 최종 검증

- 검증 시각: 2026-10-16T15:54:13.042683+09:00
- pytest: 82개 통과 (기존 60개 + 신규 22개), 실패 0개. 결과: backend/verification/station_size_v2/pytest.xml.
- 공통 필터 조합, 삭제 all/N/Y, 현재 지역 12, 관측 0건 09, 잘못된 값·빈 값·중복 파라미터·알 수 없는 파라미터, POST 405를 검증했다.
- 단일 표본, IQR=0, 선형 보간, 울타리 경계 포함, 실제 충전기 ID 중복 계수 방지 사례를 검증했다.
- 원래 9개 API 기본 응답을 작업 전후 전체 JSON으로 비교해 일치했다. 기존 OpenAPI 경로 10개와 기존 모든 스키마 객체도 동일하다.
- 원본 데이터·기존 보고서·기존 PNG 10개·프론트엔드 관련 162개 파일의 SHA-256이 동일하다. 보존 목록은 backend/verification/station_size_v2/preserved_files.json.
- 신규 PNG 10개: outputs/charts_v2_report. 한글 맑은 고딕, PNG 열기, 200dpi, 파일 해시, 제목·축·범례·단위·기준일을 확인했다.
- 16개 지역 표본·충전기 수를 CSV에서 독립 대조했다. 비삭제 충전소 100,590곳, 충전기 523,312기. 박스플롯 사분위수·수염·이상치 수는 Matplotlib 기본 1.5IQR 계산과 모두 일치한다. 지역별 이상치 표본 합계 9,748곳(삭제/오류 판정이 아님).
- 출력 양수 523,143기 + 결측·무효 169기 = 523,312기. 히스토그램 구간 합계, 히트맵 6구간 합계, 트리맵 상위20+기타 합계, EV 차종·용도 합계, 연도별 누적합을 검증했다.
- 산점도 라벨 겹침, 히트맵 y축 이름 잘림, 트리맵 좁은 셀의 긴 레이블을 신규 PNG에서 수정한 후 재검토했다. 기존 PNG에는 변경이 없다.

## 성능과 메모리

Flask 테스트 클라이언트로 4종 요청을 각 5회, 총 20회 측정했다. 필터·집계·JSON 직렬화를 포함하며 네트워크·프록시 지연은 제외한다. 현재 환경의 로컬 소켓 접근 제한으로 실제 HTTP 왕복 지연은 측정하지 않았다.

- 전체 범위 15.7–348.3ms, 평균 174.1ms. 서로 다른 결과 크기를 합친 값이며 동일 조건 벤치마크는 아니다.
- 전국 all 마지막 291.9ms, 전국 N 마지막 299.7ms, 4중 필터 마지막 72.9ms, 빈 결과 마지막 15.7ms.
- 요청 전 RSS 215.54MiB → 요청 후 214.71MiB. 프로세스 최고 RSS 461.66MiB는 CSV 초기 로드 등 기존 경로 실행을 포함한다. 다중 워커마다 CSV 스냅샷 메모리가 필요하다. 장기 부하·다중 사용자 시험은 포함하지 않았다.
- 서버 시작 CSV 로딩 3.60초. 일반 요청에서 CSV를 매번 읽거나 인증키를 사용하지 않는다.

## 실행과 Claude 전달

기존 backend 작업 디렉터리에서 `.\.venv\Scripts\python.exe run.py`로 실행하거나 현재 프로세스를 재시작한다. 다른 실행 중 서버를 임의 종료하지 않았다. 신규 코드는 현재 실행 중 프로세스에 자동 반영되지 않을 수 있다.

1. `GET /api/station-size-distribution?deletion=not_deleted`
2. 선택 필터: `region_code`, `charger_type`, `operator_id`. 기존 API와 같은 단일 코드 형식.
3. `q1/median/q3`로 상자·중앙선, `whisker_low/high`로 수염을 직접 그린다. min/max를 수염에 사용하지 않는다.
4. `outlier_distribution`은 값과 빈도다. 원시 10만 충전소를 내려받을 필요가 없다.
5. 전체 계약·실제 예시는 backend/API_SPEC.md, backend/openapi.json, reports/station_size_api_handoff.md와 backend/examples/station-size-distribution*.json을 참조한다.

## Python 그래프 재현

`scripts/create_report_charts_v2.py`와 `scripts/requirements-charts-v2.txt`를 제공한다. Python 3.12, 맑은 고딕을 사용한다. 보고서의 API 입력 스냅샷은 reports/chart_v2_api_inputs.json에 보관하며 CSV와 독립 대조한 후 그린다.

`python scripts/create_report_charts_v2.py --project-root "C:\Users\User\Documents\Codex\CHARGE GAP"`

기존 출력이 있으면 기본 실행은 중단해 덮어쓰기를 방지한다. `--repair-numbers`는 지정한 신규 그래프의 오류 수정 시에만 사용한다. 예전 outputs/charts/는 이 스크립트의 출력 대상이 아니다. 최초 재현은 별도 프로젝트 사본에서 수행한다.

프론트엔드 코드·UI는 수정하지 않았다. 과거 광주·전남을 임의 분리하지 않았으며 서로 다른 기준 시점의 부족률을 계산하지 않았다. 연도별 2026 설치 통계는 부분 연도이며 정확한 마감일이 알려져 있지 않다.

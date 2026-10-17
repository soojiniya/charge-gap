# Claude 프론트엔드 연동용 API 명세

버전 1.0. 기본 URL `http://127.0.0.1:5000`. 모든 조회는 GET입니다. 인증키나 토큰은 필요하지 않습니다. 이 백엔드는 저장된 공개 데이터만 읽습니다.

## 공통 응답

성공 응답은 `{ "data": ..., "meta": ... }`입니다. `meta`에는 `api_version`, `sources`, `units`, `filters`, `warnings`, `same_period_shortage_rate_computed=false`, `snapshot_policy`가 있습니다. 충전기 집계에는 필터 적용 후 `matched` 건수가 있습니다. 숫자는 JSON 숫자, 코드는 문자열, 정의되지 않은 수치는 `null`입니다. `NaN`/`Infinity`를 반환하지 않습니다.

`meta.sources`에 원본 출처·정제 파일명·기준월 또는 조회일·지역 체계가 기록됩니다. `meta.units`는 전기차 대수=대, 충전기=기, 충전소=곳, 출력=kW, 비율=%를 정의합니다. 응답의 `share_pct`는 **같은 요청의 필터 일치 충전기**를 분모로 하는 구성비이며 등록차량과 충전기를 나눈 비율이 아닙니다.

`matched`와 충전기 요약의 공통 필드:

| 필드 | 정의 |
|---|---|
| charger_count | 해당 필터의 충전기 행 수 / 기 |
| station_count | 해당 필터에서의 고유 statId / 곳 |
| not_deleted_charger_count | 해당 집합 중 delYn=N / 기 |
| deleted_charger_count | 해당 집합 중 delYn=Y / 기 |

기본 `deletion=all`이므로 삭제 포함 총수입니다. `deletion=not_deleted`인 경우 `charger_count`는 비삭제만 센 값이고 삭제 건수는 0입니다. `station_count`는 유형/운영기관 사이에 중복될 수 있어 분류 행의 충전소 수를 단순 합산하지 마세요. 전체 고유 충전소 수는 `meta.matched.station_count`를 사용하세요.

## 지역과 날짜

| 자료 | 시점 | 지역 체계 |
|---|---|---|
| 전기차 등록 | 2025-12 | 원래 17개 시도, 광주=29·전남=46 유지 |
| 충전기·위치·유형·출력·운영기관 | 2026-10-15 04:16~04:19 KST 조회 | 현재 16개 시도, 전남광주통합특별시=12 |
| 연도별 설치 통계 | 2011~2026 | 전국. 2026 부분 연도, 정확한 마감일 미기재 |
| 기존 그래프 | 각 항목의 period | 고정 PNG. API 필터가 적용되지 않음 |

2025년 12월 등록 899,101대, 충전기 527,433기, 충전소 101,091곳, 삭제 표시 4,121기, 비삭제 523,312기입니다. 서로 다른 시점의 비율·부족률을 계산하지 않습니다. 비삭제는 실제 이용 가능 상태가 아닙니다. statUpdDt는 설치일이 아닙니다.

현재 충전기 `region_code`: 11 서울, 12 전남광주통합특별시, 26 부산, 27 대구, 28 인천, 30 대전, 31 울산, 36 세종, 41 경기, 43 충북, 44 충남, 47 경북, 48 경남, 50 제주, 51 강원, 52 전북.

등록자료는 위 목록에서 12 대신 29 광주·46 전남을 사용합니다. 현재 12 데이터를 29·46으로 분리하지 않습니다. `/api/overview`의 `meta.filter_options`에서 두 자료의 지역 선택지와 공식 유형 정의를 각각 받을 수 있습니다.

## 요청변수 규칙

알 수 없는 변수, 반복된 변수, 빈 값, 잘못된 코드·범위·숫자 형식은 HTTP 400입니다. 필터 한 개에는 값 한 개만 받습니다. 복수 코드의 쉼표 목록이나 `regionCode` 같은 별칭은 지원하지 않습니다. 요청변수는 대소문자를 구분합니다.

충전기 공통 필터:

| 변수 | 형식 / 기본값 | 의미 |
|---|---|---|
| region_code | 두 자리 문자열 / 생략 시 전국 | 현재 16개 지역의 충전기 필터 |
| charger_type | `01`~`11` 문자열 / 생략 시 전체 | 공식 커넥터 유형 |
| deletion | `all` / `not_deleted` / `deleted`; 기본 all | 삭제 포함 / 비삭제 / 삭제 표시 |
| operator_id | 관측된 busiId 문자열 / 생략 시 전체 | 기관 ID 필터. 이름 변형은 집계에서 별도 유지 |

공식 유형: 01 DC차데모, 02 AC완속, 03 DC차데모+AC3상, 04 DC콤보, 05 DC차데모+DC콤보, 06 DC차데모+AC3상+DC콤보, 07 AC3상, 08 DC콤보(완속), 09 NACS, 10 DC콤보+NACS, 11 DC콤보2(버스전용). 09는 정의는 있지만 현재 관측 0건이라 필터 결과가 빈 배열입니다. 타입을 출력 구간으로 자동 변환하지 마세요.

## 엔드포인트

| 경로 | 요청변수 | data |
|---|---|---|
| `/api/overview` | 충전기 공통 필터 + `ev_region_code` | 등록 총수, 필터 일치 충전기/충전소 수, 필터와 무관한 전국 스냅샷 총수 |
| `/api/ev-registration` | `region_code` — **2025의 17개 코드** | 지역별 등록 합계·차종 4종·사업/비사업용 대수 |
| `/api/charger-regions` | 충전기 공통 필터 | 지역별 충전기·충전소·N/Y 건수·구성비 |
| `/api/charger-types` | 충전기 공통 필터 | 유형별 건수·공식 정의·정의 확인 여부·구성비 |
| `/api/charger-output` | 충전기 공통 필터 | output 원문별 건수·수치 kW·검증상태·구성비 |
| `/api/operators` | 충전기 공통 필터 + `page`, `limit` | 공백 정리 후 기관 ID·명칭 조합별 건수 |
| `/api/growth` | `year_from`, `year_to` | 연간 설치·누적 통계 및 부분 연도 표시 |
| `/api/locations` | 충전기 공통 필터 + `page`, `limit`, `bbox` | 충전소별 대표 좌표·일치 충전기 수 |
| `/api/charts` | 선택 `chart_id=1..10` | 기존 그래프의 목적·종류·기간·분석·주의·수치·이미지 메타데이터 |
| `/api/charts/{id}/image` | 경로 id=1..10; query 없음 | 기존 PNG 이미지. JSON이 아닌 image/png |

### overview 필터 범위

`region_code`, `charger_type`, `deletion`, `operator_id`는 **chargers만** 필터합니다. `ev_region_code`는 **ev_registration만** 필터합니다. 예를 들어 `?region_code=12&ev_region_code=29`는 현재 전남광주 충전기와 과거 광주 등록을 각각 표시할 뿐 같은 권역·같은 시점 비교를 뜻하지 않습니다. `national_snapshot_totals`는 필터와 무관한 기준 총수이며, 실제 선택 총수는 `data.chargers` 또는 `meta.matched`를 사용하세요.

### 주요 행 스키마

- 등록: `reference_month`, `region_system`, `region_code_2025`, `region_name_2025`, `ev_registration_count`, `ev_passenger_count`, `ev_bus_count`, `ev_truck_count`, `ev_special_count`, `ev_noncommercial_count`, `ev_commercial_count`.
- 지역: `region_code`, `region_name` + 충전기 공통 건수와 `share_pct`.
- 유형: `charger_type_code`, `official_definition`, `definition_verified` + 공통 건수와 `share_pct`.
- 출력: `output_raw`, `output_kw`(숫자 또는 null), `value_status`(`positive_numeric/missing/nonpositive/nonnumeric`) + 공통 건수와 `share_pct`. `meta.output_statistics`에는 양수 유효값의 개수·결측/무효값 수·최소·중앙·최대 kW가 있습니다. 빈 집합의 통계 수치는 null입니다.
- 운영기관: `operator_id`, `operator_name` + 공통 건수와 `share_pct`. 앞뒤 공백만 정리하며 파워큐브/파워큐브코리아 같은 다른 이름은 통합하지 않습니다. 현재 전체 342개 조합입니다.
- 연도 통계: `year`, `annual_installed_count`, `cumulative_count`, `completed_calendar_year`, `is_partial_year`, `measurement_cutoff_date`(현재 null). `year_from/to`는 2011~2026 정수, 기본 전체 기간이며 시작≤종료여야 합니다. 누적값은 선택 구간의 누적합으로 다시 계산하지 않고 원본 전체 기간의 누적 통계 그대로 제공합니다.
- 위치: `station_id`, `station_name`, `address`, `region_code`, `region_name`, `latitude`, `longitude`, `charger_count`, `station_count`(행당 1), `not_deleted_charger_count`, `deleted_charger_count`. 좌표는 WGS84 경위도입니다.
- 그래프: `id`, `filename`, `title`, `chart_type`, `purpose`, `data`, `reason`, `results`, `caution`, `period`, `metrics`, `image_pixels`, `dpi`, `sha256`, `image_url`, `filters_apply=false`.

### 위치 API와 페이지네이션

`page`는 1부터 시작하는 정수, 기본 1, 최대 1,000,000입니다. 위치의 `limit` 기본 200, 범위 1~1,000입니다. 운영기관의 `limit` 기본 50, 범위 1~200입니다. 페이지 범위를 넘으면 빈 배열과 동일한 전체 결과 수를 반환합니다.

`meta.pagination`: `page`, `limit`, `total_items`, `total_pages`, `has_next`, `next_page`(마지막에는 null). 위치 API의 `total_items`는 충전기가 아닌 **고유 충전소** 수입니다. `matched`는 해당 bbox까지 일치하는 전체 집합의 수이며 현재 페이지 합계가 아닙니다.

`bbox=최소경도,최소위도,최대경도,최대위도`, 예: `126.8,37.4,127.2,37.7`. 유한한 숫자 4개, 경도 -180~180, 위도 -90~90, 최소≤최대가 필요하며 경계값을 포함합니다.

처리 순서는 **충전기 필터 → statId별 집계 → 유효 좌표 중 비삭제 N 우선·chgerId 순 대표 좌표 → 대표 좌표에 bbox → station_id 순 페이지네이션**입니다. 필터가 바뀌면 해당 충전소의 일치 충전기 수와 대표 좌표가 바뀔 수 있습니다. 여러 좌표가 있는 충전소도 하나의 점입니다. 좌표 유효 범위는 위도 33~39.5·경도 124~132이며 행정경계 검증은 아닙니다. 유효 좌표가 없는 충전소 제외 수와 무효 좌표 행 수는 meta에 별도 기록합니다.

### 오류 형식

```json
{"error":{"code":"INVALID_PARAMETER","message":"허용된 값 또는 해당 자료의 지역 체계를 확인하세요.","parameter":"region_code"},"meta":{"api_version":"1.0"}}
```

400 잘못된 요청변수, 404 경로/그래프 없음, 405 지원하지 않는 메서드, 503 이미지 제공 불가, 500 내부 오류입니다. 오류에 서버 경로·스택·환경변수·요청 값은 노출하지 않습니다. 잘못된 값은 보정하거나 조용히 무시하지 않습니다.

## Claude 연동

프론트엔드의 API base URL을 `http://127.0.0.1:5000`으로 설정하고 상대 경로를 결합하세요. `/api/overview`의 `filter_options`로 자료별 지역/유형 선택지를 구성할 수 있습니다. 응답 처리 시 HTTP 상태와 `error`를 먼저 확인한 후 `data`와 `meta`를 분리하세요. 지도는 bbox와 작은 limit로 조회하고 `next_page`를 사용하세요.

고정 PNG는 응답의 `image_url`에 API base URL을 붙여 표시하세요. 사용자가 필터를 바꿔도 기존 PNG는 변하지 않습니다. 필터 기반 인터랙티브 그래프는 프론트엔드가 JSON을 그려야 합니다. 출력 차트는 결측/무효 항목을 분리하고 실제 kW 통계는 `positive_numeric`만 사용하세요.

기본 CORS 허용 origin은 `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`, `http://127.0.0.1:3000`입니다. origin 전체 문자열을 비교하며 credentials는 허용하지 않습니다. 다른 프론트엔드 주소는 실행 전에 설정합니다.

```powershell
$env:CHARGE_GAP_CORS_ORIGINS='http://localhost:5173,http://localhost:3000'
.\.venv\Scripts\python.exe run.py
```

허용되지 않은 origin에는 CORS 허용 헤더를 보내지 않습니다. `.env`, 원본 파일 경로, 인증키를 프론트엔드 설정에 복사하지 마세요. 이 API는 인증키를 사용하지 않습니다.

## 실제 응답과 기계 판독 명세

`examples/`의 JSON은 실제 CSV를 로드한 서버에 로컬 HTTP GET 요청을 보내 저장한 응답입니다. 예제별 요청 URL·상태·지연시간은 `verification/http_smoke.json`에 있습니다. `openapi.json`은 OpenAPI 3.0.3 형식으로 요청변수·성공/오류 스키마·예제를 제공합니다. 코드 테스트와 파일 보존 검증 결과는 `verification/`을 참조하세요.

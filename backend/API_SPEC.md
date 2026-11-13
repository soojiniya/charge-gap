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
| 전기차 등록 | 2026-09 | 원본 16개 지역, 전남광주=12로 명칭 매핑 |
| 충전기·위치·유형·출력·운영기관 | 2026-10-15 04:16~04:19 KST 조회 | 현재 16개 시도, 전남광주통합특별시=12 |
| 연도별 설치 통계 | 2011~2026 | 전국. 2026 부분 연도, 정확한 마감일 미기재 |
| 기존 그래프 | 각 항목의 period | 고정 PNG. API 필터가 적용되지 않음 |

2026년 9월 등록 1,191,873대, 2026-10-15 충전기 527,433기, 충전소 101,091곳, 삭제 표시 4,121기, 비삭제 523,312기입니다. 두 자료의 16개 지역은 대응하지만 서로 다른 기준일의 비율·부족률은 계산하지 않습니다. 비삭제는 실제 이용 가능 상태가 아닙니다. statUpdDt는 설치일이 아닙니다.

현재 충전기 `region_code`: 11 서울, 12 전남광주통합특별시, 26 부산, 27 대구, 28 인천, 30 대전, 31 울산, 36 세종, 41 경기, 43 충북, 44 충남, 47 경북, 48 경남, 50 제주, 51 강원, 52 전북.

등록자료도 위 16개 코드를 사용하며 원본의 전남광주를 12에 대응합니다. 현재 12 데이터를 과거 29·46으로 분리하지 않습니다. `/api/overview`의 `meta.filter_options`에서 두 자료의 지역 선택지와 공식 유형 정의를 각각 받을 수 있습니다.

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
| `/api/ev-registration` | `region_code` — **2026-09의 16개 코드, 전남광주=12** | 지역별 등록 합계·차종 4종·사업/비사업용 대수. 과거 29/46은 400 |
| `/api/charger-regions` | 충전기 공통 필터 | 지역별 충전기·충전소·N/Y 건수·구성비 |
| `/api/charger-types` | 충전기 공통 필터 | 유형별 건수·공식 정의·정의 확인 여부·구성비 |
| `/api/charger-output` | 충전기 공통 필터 | output 원문별 건수·수치 kW·검증상태·구성비 |
| `/api/charger-output/regions` | 충전기 공통 필터 (`region_code`는 무시) | 16개 지역 각각의 `/api/charger-output` 결과를 한 번에 (지역 × 출력 히트맵용, 아래 절) |
| `/api/operators` | 충전기 공통 필터 + `page`, `limit` | 공백 정리 후 기관 ID·명칭 조합별 건수 |
| `/api/growth` | `year_from`, `year_to` | 연간 설치·누적 통계 및 부분 연도 표시 |
| `/api/locations` | 충전기 공통 필터 + `page`, `limit`, `bbox` | 충전소별 대표 좌표·일치 충전기 수 |
| `/api/locations/grid` | 충전기 공통 필터 + **필수** `bbox`, `zoom=11..15` | 화면 영역 전체 충전소를 고정 격자 칸으로 집계 (지도 줌 11~15 묶음용, 아래 절) |
| `/api/charts` | 선택 `chart_id=1..10` | 기존 그래프의 목적·종류·기간·분석·주의·수치·이미지 메타데이터 |
| `/api/charts/{id}/image` | 경로 id=1..10; query 없음 | 기존 PNG 이미지. JSON이 아닌 image/png |
| `/api/station-size-distribution` | 충전기 공통 필터 | 지역별 충전소당 충전기 수 박스플롯 통계 (아래 추가 API 절) |
| `/api/regional-disparity` | 충전기 공통 필터 (`region_code`는 무시) | 16개 시도의 구성 격차 5개 지표·전국 기준·순위 (아래 추가 API 절) |

### locations/grid (지도 충전소 묶음용 격자 집계)

- 목적: 지도 줌 11~15에서 화면 영역의 **모든** 충전소를 반영해 묶음을 그립니다. 이전에는 `/api/locations`를 충전소 ID 순으로 최대 3,000곳만 받아 묶어, 밀집 지역에서 운영기관(ID 접두사) 쪽으로 치우쳤습니다.
- 대표 좌표는 `/api/locations`와 같습니다(충전기 필터 → statId별 N 우선/충전기 ID 순 첫 유효 좌표).
- 칸 크기: 지도 화면 32px 상당 = `32 × 2^(17−zoom)` m. 위도 칸 = m / 111,320°, 경도 칸 = m / (111,320 × cos 36°)°. 칸 번호는 `floor(경도/경도 칸)`, `floor(위도/위도 칸)`로 bbox와 무관한 고정 격자입니다.
- 응답 `data`: 요청 bbox를 감싸는 칸 중 충전소가 있는 칸마다 `cell`, `station_count`, `charger_count`, `not_deleted_charger_count`, `deleted_charger_count`, 대표 좌표 평균 `latitude`/`longitude`, 범위 `south`/`west`/`north`/`east`, 칸에 충전소가 1곳이면 그 행 `station`(아니면 null).
- `meta.matched`: 요청 bbox 안(경계 포함) 충전소 집계 = 같은 bbox의 `/api/locations` `meta.matched`. `meta.grid`: 칸 크기, 칸 정렬 bbox(`snapped_bbox`), 칸 수와 칸 합계.
- 400: `bbox` 또는 `zoom` 누락, `zoom`이 11~15 밖, bbox가 이 줌에서 40,000칸 초과, 그 밖의 공통 검증 오류.
- `/api/locations`(페이지 방식)는 그대로이며, 지도는 줌 16 이상(개별 충전소)과 목록에서 계속 사용합니다.

### 좌표 품질 안내 `coordinate_flag` (locations · locations/grid 선택 필드)

- `/api/locations`의 행과 `/api/locations/grid`의 `station` 행 중 **원본 좌표 품질이 의심되는 충전소에만** 붙는 선택 필드입니다. 정상 행에는 키가 없습니다(`null`도 넣지 않음). 실제 위치 오류를 확정하는 값이 아닙니다.
- 값: `placeholder`(대체·저정밀 좌표), `far_from_address`(주소 시군구에서 100km 초과), `placeholder_far_from_address`(둘 다).
- 판정: 서버 프로세스에서 처음 필요할 때 필터 없는 대표 좌표 표(101,091곳)로 한 번 계산해 재사용합니다. 주소 시군구는 앞 두 단어이며 시도 약칭을 정식 명칭으로 맞춥니다.
  - `placeholder`: 대표 좌표(소수 6자리)를 주소 시군구가 2개 이상 다른 충전소 3곳 이상이 공유하거나, 위도·경도가 모두 소수 1자리 이하.
  - `far_from_address`: 같은 주소 시군구 충전소 대표 좌표의 중앙값에서 100km 초과(위도 1° = 110.57km, 경도 1° = cos 36° × 111.32km).
  - 2026-10-15 스냅샷: placeholder 508곳, far_from_address 182곳, 둘 다 46곳, 합계 644곳(충전기 3,322기). 목록과 근거: `reports/coordinate_quality_2026-11-13.md`.
- 필터 응답에서는 행 좌표가 판정 때 좌표와 같을 때만 붙입니다(대표 좌표가 바뀐 행에는 붙이지 않음).
- 좌표, 건수, `matched`, 페이지, 격자 칸, bbox 판정, 캐시는 이 필드와 무관하게 이전과 같습니다. 판정 설명은 `meta.coordinate_quality_rule`에 있습니다.

### charger-output/regions (지역 × 출력 히트맵용)

Regional Explorer의 지역 × 출력 구간 히트맵은 이전에 `/api/charger-output?{지역 외 필터}&region_code=R`을 16개 지역마다 요청했습니다. 이 경로는 같은 결과를 한 번에 돌려줍니다. 기존 `/api/charger-output`은 그대로입니다.

- 요청변수: 충전기 공통 필터(`charger_type`, `deletion`, `operator_id`)와 같은 검증. `region_code`는 받되 무시하고 항상 16개 지역을 반환합니다(`meta.region_filter_policy`).
- `data.common_meta`: 모든 지역에 공통인 meta(`api_version`, `sources`, `units`, `warnings`, `same_period_shortage_rate_computed`, `snapshot_policy`, `output_note`).
- `data.regions[i]`: `region_code`, `data`(행 형식은 `/api/charger-output`과 같음), `filters`, `matched`, `count`, `output_statistics`. 순서는 16개 지역 코드 순.
- 지역 R의 응답 재구성: `{data: regions[R].data, meta: {...common_meta, filters, matched, count, output_statistics}}` = 같은 지역 외 필터의 `/api/charger-output?region_code=R` 응답(data·meta 모두 동일, `backend/tests/test_charger_output_regions.py`).
- 계산: 필터 선택 1회 → (지역, output) 그룹 집계 1회. 지역 안 구성비 = 충전기 수 ÷ 그 지역 충전기 수 × 100(지역별 요청과 같은 계산). 지역별 일치 건수·출력 통계도 필요한 열만 그룹 집계합니다.

### overview 필터 범위

`region_code`, `charger_type`, `deletion`, `operator_id`는 **chargers만** 필터합니다. `ev_region_code`는 **ev_registration만** 필터합니다. 예를 들어 `?region_code=12&ev_region_code=29`는 현재 전남광주 충전기와 과거 광주 등록을 각각 표시할 뿐 같은 권역·같은 시점 비교를 뜻하지 않습니다. `national_snapshot_totals`는 필터와 무관한 기준 총수이며, 실제 선택 총수는 `data.chargers` 또는 `meta.matched`를 사용하세요.

### 주요 행 스키마

- 등록: `reference_month`, `region_system`, `region_code`, `region_name`, `ev_registration_count`, `ev_passenger_count`, `ev_bus_count`, `ev_truck_count`, `ev_special_count`, `ev_noncommercial_count`, `ev_commercial_count`.
- 호환 필드 `region_code_2025`, `region_name_2025`는 deprecated 별칭으로 현재 지역 값을 반환합니다. 과거 2025년 수치가 아닙니다. 신규 클라이언트는 일반 필드명을 사용하세요. 현재 응답 예시는 `examples/overview-current-2026-09.json`, `examples/ev-registration-current-2026-09.json`입니다. 과거 예시와 PNG는 당시 기준의 기록으로 보존합니다.
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


## 추가 API: 충전소당 충전기 수 분포 (v2 지원)

`GET /api/station-size-distribution`

공통 필터 `region_code`, `charger_type`, `deletion`, `operator_id`를 그대로 지원합니다. 모든 값은 단일 문자열입니다. 삭제 기본값은 기존 API와 같은 `all`이며, 프론트엔드의 비삭제 그래프에는 반드시 `deletion=not_deleted`를 지정하세요. `N`은 실제 이용 가능 상태를 의미하지 않습니다. 정의된 관측 0건 유형 `09`는 정상 200 빈 결과입니다. 잘못된/빈/중복/알 수 없는 요청변수는 400입니다. `page`, `limit`, `bbox`는 지원하지 않습니다.

처리 순서: CSV의 충전기 행에 모든 필터 적용 → `(zcode, statId)`별 고유 `chgerId` 수 → 지역별 분포 통계. 유형/기관 필터를 지정하면 해당 유형/기관의 충전기만으로 산정한 충전소 규모입니다. 필터에 맞는 충전기가 없는 충전소를 0기 표본으로 추가하지 않습니다. statId를 다른 지역으로 재분할하거나 기존 17개 등록 지역과 결합하지 않습니다.

| data 각 행 | 의미·단위 |
|---|---|
| region_code, region_name | 현재 16개 시도 코드·이름 |
| station_count, sample_count | 지역 내 표본 충전소 수 (두 값 동일), 곳 |
| charger_count | 표본 충전소의 필터 일치 충전기 합계, 기 |
| min, max | 원래 표본의 최소·최대, 기/곳 (수염과 다름) |
| q1, median, q3 | 선형 보간 사분위수, 기/곳 |
| mean | 표본 평균, 기/곳 |
| iqr | Q3−Q1, 기/곳 |
| fence_low, fence_high | Q1−1.5IQR, Q3+1.5IQR (음수 가능), 기/곳 |
| whisker_low, whisker_high | 울타리 양끝 포함 범위 안에 있는 실제 최솟값·최댓값, 기/곳 |
| outlier_count | 울타리 밖 충전소 관측 개수, 곳 (서로 다른 값 개수가 아님) |
| outlier_distribution | 오름차순 `{charger_count: 기/곳, station_count: 빈도/곳}`. 빈도 합 = outlier_count |

사분위수: 정렬한 크기 n 표본에 대해 h=(n−1)p를 0번부터 인덱싱하고 양쪽 관측 사이를 선형 보간합니다(p=.25,.5,.75). pandas `quantile(interpolation="linear")`, NumPy 기본 percentile, Matplotlib `boxplot_stats(whis=1.5, autorange=False)`와 일치합니다. 수염은 울타리 자체가 아닙니다. 이상치는 엄격히 울타리 밖이며 경계와 같은 값은 포함합니다. n=1이면 사분위수·수염 모두 동일하며 이상치 0입니다. IQR=0일 때 자동으로 전체 범위로 수염을 확장하지 않습니다. 이상치를 삭제하거나 데이터 오류로 판정하지 않습니다.

빈 지역은 data에서 생략합니다. 전체 빈 결과는 `data: []`, `meta.count: 0`, `meta.sample_count: 0`, matched의 각 건수 0입니다. null/NaN으로 된 가짜 지역 행을 추가하지 않습니다. `meta.sample_count`는 지역별 표본 합계이며 `meta.matched.station_count`는 전국 고유 statId입니다. 이 스냅샷에서는 같은 statId가 여러 지역에 걸치지 않아 두 값이 같습니다.

기존 `data`/`meta` 봉투, 출처·기준일·필터·matched를 유지합니다. 추가 meta: `quantile_method="linear"`, `whisker_iqr_multiplier=1.5`, `whisker_rule`, `sample_unit`, `deletion_policy`, `empty_policy`, `sample_count`, `count`. 기/곳 통계 단위는 위 표를 따릅니다.

### Claude 박스플롯 연결

`/api/station-size-distribution?deletion=not_deleted`를 호출하세요. 상자에는 q1/q3, 중앙선에는 median, 수염에는 whisker_low/whisker_high를 직접 사용하고 라이브러리의 기본 수염 재계산을 비활성화하세요. min/max를 수염에 매핑하면 안 됩니다. outlier_distribution의 charger_count를 이상치 점 위치로, station_count를 빈도/툴팁으로 사용하세요. 동일 값의 점을 하나만 그려도 빈도를 표시하면 원본 관측 개수를 유지할 수 있습니다. 데이터나 이상치 좌표에 임의 지터를 더하지 않아도 됩니다.

실제 필터 조합 예시:

`GET /api/station-size-distribution?region_code=36&charger_type=04&deletion=not_deleted&operator_id=ME`

```json
{
  "data": [
    {
      "charger_count": 70,
      "fence_high": 3.5,
      "fence_low": -0.5,
      "iqr": 1.0,
      "max": 6,
      "mean": 1.8918918918918919,
      "median": 2.0,
      "min": 1,
      "outlier_count": 5,
      "outlier_distribution": [
        {
          "charger_count": 4,
          "station_count": 4
        },
        {
          "charger_count": 6,
          "station_count": 1
        }
      ],
      "q1": 1.0,
      "q3": 2.0,
      "region_code": "36",
      "region_name": "세종",
      "sample_count": 37,
      "station_count": 37,
      "whisker_high": 2,
      "whisker_low": 1
    }
  ],
  "meta": {
    "filters": {
      "charger_type": "04",
      "deletion": "not_deleted",
      "operator_id": "ME",
      "region_code": "36"
    },
    "matched": {
      "charger_count": 70,
      "deleted_charger_count": 0,
      "not_deleted_charger_count": 70,
      "station_count": 37
    },
    "sample_count": 37,
    "quantile_method": "linear",
    "whisker_iqr_multiplier": 1.5
  }
}
```

위 예시는 data와 핵심 meta만 발췌했습니다. 당시 실제 응답은 `examples/station-size-distribution-filtered.json`, 전국 비삭제 응답은 `examples/station-size-distribution.json`에 보존했습니다. 현재 등록자료 2026-09와 이 API의 충전기 조회 2026-10-15는 다른 기준일입니다. 이 API는 설치일·부족률을 계산하지 않습니다. 신규 PNG는 `outputs/charts_v2_report/`에 따로 보관하며 기존 `/api/charts`의 10개 고정 PNG 목록은 유지됩니다.

## 추가 API: 지역 충전 인프라 구성 격차

`GET /api/regional-disparity`

16개 시도의 충전 인프라 **공급 구성** 차이를 5개 지표로 비교합니다. 충전기 공통 필터 `charger_type`, `deletion`, `operator_id`를 지원합니다. `region_code`는 요청 호환을 위해 받지만 **무시**하며 항상 16개 시도를 모두 반환합니다(`meta.region_filter_policy`). 알 수 없는 변수·잘못된 값은 다른 API와 같은 400 오류 형식입니다. `page`, `limit`, `bbox`는 지원하지 않습니다.

| 지표 (`metrics` 키) | 계산 | 분모 | 값 필드 |
|---|---|---|---|
| `high_100kw` | 출력 100kW 이상 충전기 수 ÷ 출력값이 확인된 충전기 수 × 100 | 출력(`output`)이 숫자이고 0보다 큰 충전기. 결측·0 이하·숫자 아님은 분자·분모 모두 제외 | `value_pct` (%) |
| `chargers_per_station` | 충전기 수 ÷ 고유 `statId` 수 | 지역 고유 충전소 수 | `value` (기/곳) |
| `type_mix` | 유형별 충전기 수 ÷ 지역 충전기 수 × 100 | 지역 충전기 수 | 배열 항목별 `value_pct` (%) |
| `operator_hhi` | Σ(운영기관 그룹 충전기 수 ÷ 지역 충전기 수)² × 10,000 | 지역 충전기 수. 그룹 = 공백 정리한 `(busiId, busiNm)` | `value` (0–10,000), `operator_count` |
| `deletion_share` | 삭제 표시(`delYn=Y`) 충전기 수 ÷ 전체 충전기 수 × 100 | 삭제 상태 전체. **이 지표는 `deletion` 필터와 관계없이 all로 계산** | `value_pct` (%) |

응답 구조: `data.regions`는 16개 행(`region_code`, `region_name`, 필터 적용 후 `charger_count`·`station_count`, `metrics`), `data.national`은 같은 5개 지표의 전국 값입니다. 비율 지표는 `numerator`·`denominator`를 함께 제공합니다.

- **전국 기준값**은 지역 비율의 평균이 아닙니다. 전국의 분자와 분모를 각각 합산한 뒤 나눕니다. 전국 HHI는 전국 운영기관별 충전기 수로 다시 계산합니다(`meta.national_basis`).
- **순위** `rank`는 값이 큰 지역이 1위인 경쟁 순위입니다. 동률은 같은 순위를 받고 다음 순위는 그 수만큼 건너뜁니다. 값이 `null`인 지역(필터 결과 충전기 0기, 분모 0)은 순위가 없으며 `rank` 키가 빠집니다(`meta.ranking_policy`).
- **`type_mix`** 는 전국에서 관측된 유형마다 1개 항목입니다. 충전기가 있는 지역은 없는 유형을 `charger_count: 0`, `value_pct: 0`으로 채우고, 필터 결과 충전기가 0기인 지역은 빈 배열입니다. 09(NACS)는 관측 0건이라 항목이 없습니다.
- **값이 `null`인 경우**: 필터 결과 지역 충전기가 0기(이 경우 `type_mix`도 빈 배열)이거나 지표의 분모가 0일 때입니다. `0`(실제 0건)과 구분하세요.
- 추가 meta: `count`·`region_count`(16), `metric_rules`(지표별 계산 규칙 원문), `national_basis`, `region_filter_policy`, `deletion_share_policy`, `ranking_policy`, `deletion_warning`. `filters.region_code`는 항상 `null`, `filters.deletion_share_deletion_filter`는 `all`입니다.
- 해석 주의: 공급 측 충전기 자료만으로 만든 구성 지표입니다. 충전 수요·인구·전기차 등록 대수와 결합하지 않으며 부족률을 계산하지 않습니다(`same_period_shortage_rate_computed=false`). 삭제 표시는 자료상 표기이며 실제 고장·이용 불가를 뜻하지 않습니다. 충전기 자료 기준일은 2026-10-15 조회입니다.

실제 응답 발췌 (`GET /api/regional-disparity`, 16개 지역 중 서울 1개, `type_mix`는 02·04 두 항목만 표시):

```json
{
  "data": {
    "regions": [
      {
        "charger_count": 76202,
        "region_code": "11",
        "region_name": "서울",
        "station_count": 13035,
        "metrics": {
          "chargers_per_station": {
            "denominator": 13035,
            "numerator": 76202,
            "rank": 6,
            "value": 5.845953202915228
          },
          "deletion_share": {
            "denominator": 76202,
            "numerator": 696,
            "rank": 7,
            "value_pct": 0.9133618540195796
          },
          "high_100kw": {
            "denominator": 76191,
            "numerator": 4175,
            "rank": 14,
            "value_pct": 5.479649827407437
          },
          "operator_hhi": {
            "operator_count": 166,
            "rank": 6,
            "scale": "0-10000",
            "value": 701.442869883696
          },
          "type_mix": [
            {
              "charger_count": 70118,
              "charger_type_code": "02",
              "denominator": 76202,
              "rank": 3,
              "value_pct": 92.01595758641506
            },
            {
              "charger_count": 4152,
              "charger_type_code": "04",
              "denominator": 76202,
              "rank": 15,
              "value_pct": 5.448675887771975
            }
          ]
        }
      }
    ],
    "national": {
      "chargers_per_station": {
        "denominator": 101091,
        "numerator": 527433,
        "value": 5.2174080778704335
      },
      "deletion_share": {
        "denominator": 527433,
        "numerator": 4121,
        "value_pct": 0.781331467693527
      },
      "high_100kw": {
        "denominator": 527264,
        "numerator": 42417,
        "value_pct": 8.04473660253687
      },
      "operator_hhi": {
        "operator_count": 342,
        "scale": "0-10000",
        "value": 585.7074915470868
      },
      "type_mix": [
        {
          "charger_count": 469049,
          "charger_type_code": "02",
          "denominator": 527433,
          "value_pct": 88.93053714879426
        },
        {
          "charger_count": 43676,
          "charger_type_code": "04",
          "denominator": 527433,
          "value_pct": 8.28086221377881
        }
      ]
    }
  },
  "meta": {
    "count": 16,
    "region_count": 16,
    "filters": {
      "charger_type": null,
      "deletion": "all",
      "deletion_share_deletion_filter": "all",
      "operator_id": null,
      "region_code": null
    },
    "matched": {
      "charger_count": 527433,
      "deleted_charger_count": 4121,
      "not_deleted_charger_count": 523312,
      "station_count": 101091
    },
    "ranking_policy": "Descending competition rank; ties share rank; null values are unranked.",
    "region_filter_policy": "region_code is accepted for request compatibility but ignored; always compares all 16 regions.",
    "deletion_share_policy": "Deletion share always uses all deletion statuses regardless of the requested deletion filter."
  }
}
```

전체 응답 스키마와 예시는 `openapi.json`의 `/api/regional-disparity`, `RegionalDisparityResponse`에 있습니다. 웹 화면의 지표 전환은 이 응답 하나를 재사용하며 지표마다 다시 요청하지 않습니다. CSV·PDF 내보내기도 같은 응답 값을 그대로 사용합니다.

# 좌표 품질 표시 기능 설계 (구현 전 승인용)

작성일: 2026-11-13. 기준 커밋: `c7eb0a2`.

이 문서는 설계 문서입니다. 백엔드·프론트엔드 코드, 원본 데이터, 배포 상태는 아직 바꾸지 않았습니다. 판정 규칙과 분석 결과는 [`coordinate_quality_2026-11-13.md`](coordinate_quality_2026-11-13.md)에 있습니다.

## 1. 목표와 원칙

- 품질이 의심되는 좌표의 충전소를 지도 정보창과 선택 충전소 패널에서 한 줄로 안내합니다. 대상은 644곳입니다.
- 원본 CSV, R2 객체, `data-manifest.json`은 바꾸지 않습니다. 품질 표시는 서버가 메모리에서 계산합니다.
- 정상 좌표에는 아무것도 추가하지 않습니다. 응답 필드도 화면 문구도 없습니다.
- 표시만 합니다. 좌표를 보정하거나 제외하지 않고, 지도 묶음·필터·지역 통계 계산도 지금과 같게 둡니다.

## 2. 현재 구조 확인

| 위치 | 현재 동작 | 설계에 주는 의미 |
|---|---|---|
| `DataStore.__init__` (`data.py`) | CSV에서 13개 열만 읽고 위도·경도는 숫자(`_lat`, `_lng`)로 바꿉니다. `addr`는 범주형(고유 주소 70,191개)입니다. | 추가 열이나 원문 좌표 문자열은 필요하지 않습니다. 소수 1자리 판정은 숫자로 합니다. |
| `DataStore.locations(frame)` | 충전소마다 대표 좌표 하나와 건수를 담은 표를 돌려줍니다. 열: `station_id`, `station_name`, `address`, `region_code`, `region_name`, `latitude`, `longitude`, 건수 4개 | 판정의 입력입니다. 필터 없이 한 번만 부릅니다. |
| `representative_table` (`routes.py`) | 필터별 대표 좌표 표를 `locations_cache`(48MiB)에 넣습니다. `/locations`와 `/locations/grid`가 함께 씁니다. | 캐시된 표에는 열을 추가하지 않습니다. 캐시 크기 계산이 바뀌지 않게 하기 위해서입니다. |
| `/api/locations` | `paginated()`가 최대 1,000행을 dict로 바꿉니다. | 품질 정보는 dict로 바뀐 뒤에 붙입니다. |
| `/api/locations/grid` | 충전소가 1곳뿐인 칸에만 `station`(같은 행 형식)을 넣습니다. `@cached` 응답 캐시를 거칩니다. | `station` dict에 같은 방식으로 붙입니다. 응답 캐시에는 붙인 결과가 저장됩니다. |
| `LocationRow` (`frontend/src/api/types.ts`) | `/locations` 행과 격자 `station`이 같은 타입을 씁니다. | 선택 필드 하나를 추가합니다. |
| `InfoWindow` (`StationMap.tsx` 약 755–810행) | 이름, 주소, 건수, `지역 · ID · 상세는 오른쪽 패널` | 주소 아래에 안내 한 줄을 넣습니다. |
| 선택 충전소 영역 (`MapAnalysisPanel.tsx` 약 227–250행) | `geo-station-name`, `geo-station-addr`, `geo-station-stats` | 주소 아래에 같은 안내 한 줄을 넣습니다. |

**필터를 걸면 대표 좌표가 바뀌는지 확인했습니다.** 644곳을 다음 조건에서 비교했고, 대표 좌표가 필터 없는 값과 달라진 곳은 모두 0곳이었습니다.

| 필터 | 대상 충전소 | 대표 좌표가 바뀐 곳 |
|---|---:|---:|
| 삭제 표시: 전체 | 644 | 0 |
| 삭제 표시: 비삭제 | 643 | 0 |
| 삭제 표시: 삭제 | 1 | 0 |
| 충전기 유형 02 | 493 | 0 |
| 충전기 유형 04 | 95 | 0 |
| 충전기 유형 07 | 8 | 0 |

따라서 필터 없는 표에서 한 번 계산한 결과를 `station_id`로 찾아 붙이면 됩니다. 다만 안전장치로 응답 행의 좌표가 판정 때 좌표와 1e-6° 안에서 같을 때만 붙입니다.

## 3. 백엔드 설계

### 3.1 계산 위치와 시점: 처음 요청할 때 한 번 계산하고 기억

`DataStore`에 다음 메서드를 추가합니다.

```python
def coordinate_flags(self) -> dict[str, tuple[str, float, float]]
```

- 결과는 `{station_id: (flag, lat, lng)}`입니다. 처음 부를 때 계산하고 그 뒤에는 기억해 둔 값을 돌려줍니다(지연 계산).
  - 동시 요청 문제는 없습니다. Waitress가 스레드 1개로 동작하므로 잠금은 두지 않습니다.
- 입력은 `self.locations(self.select(필터 없음))`의 `station_id`, `address`, `latitude`, `longitude` 4개 열입니다.
- 계산 순서:
  1. 정규화 시군구를 구합니다. 주소가 범주형이므로 고유 주소 70,191개만 나눈 뒤 행에 대응시킵니다.
  2. 좌표 키를 만듭니다(소수 6자리 반올림). 좌표 키별로 충전소 수와 정규화 시군구 개수를 셉니다. 3곳 이상이면서 시군구가 2개 이상이면 공유 좌표입니다.
  3. 소수 1자리 판정: 위도·경도 모두 `abs(v*10 - round(v*10)) < 1e-9`이면 해당합니다.
  4. 정규화 시군구별 좌표 중앙값을 구합니다. 그 중앙값에서 100km를 넘게 떨어지면 `far_from_address`입니다.
  5. 해당하는 충전소만 dict에 넣습니다. 644개 항목입니다.
- 규칙 값은 `data.py` 상단 상수로 둡니다: `FAR_KM=100`, `SHARED_MIN_STATIONS=3`, `SHARED_MIN_SGG=2`, 시도 약칭 표.

**시작할 때 미리 계산하지 않는 이유**
- Render Free 인스턴스는 CPU 0.15개이고 잠든 뒤 깨어날 때 이미 약 1분이 걸립니다. 시작할 때 계산하면 이 시간이 늘어납니다.
- 로컬에서 잰 비용은 대표 표 0.15초, 주소 파싱 0.09초, 그룹 계산 0.34초입니다. Render에서는 수 초가 될 수 있습니다.
- 처음 지도를 여는 요청은 어차피 대표 표를 만들어야 하므로, 그때 함께 계산하는 편이 낫습니다.

### 3.2 응답에 붙이는 방식: 해당 행에만 선택 필드 하나

- 필드 이름은 `coordinate_flag`, 값은 문자열입니다.

| 값 | 뜻 | 곳 |
|---|---|---:|
| `placeholder` | 대체·저정밀 좌표 | 462 |
| `far_from_address` | 주소 시군구에서 100km 초과 | 136 |
| `placeholder_far_from_address` | 두 기준 모두 해당 | 46 |

- 정상 행에는 키를 넣지 않습니다. `null`도 넣지 않습니다.
  - 모든 행에 `"coordinate_flag":null`을 넣으면 `/api/locations?limit=1000` 응답이 23KB(7%) 늘어납니다.
  - 해당 행에만 넣으면 늘어나는 양은 사실상 0입니다(행의 약 0.6%).
- 붙이는 곳(`routes.py`):
  - `/api/locations`: `paginated()`가 만든 dict 목록에 붙입니다.
  - `/api/locations/grid`: `station_rows`의 dict에 붙입니다.
  - 두 곳 모두 작은 헬퍼 하나를 씁니다: `annotate(rows)`. 행마다 dict 조회 한 번이고, 좌표가 맞을 때만 키를 추가합니다.
- 메타 정보에 `coordinate_quality_rule` 문자열 하나를 추가합니다. 판정 기준을 설명하는 문구로, 응답당 약 600B입니다(구현 후 정정: 처음 예상은 약 200B). `/api/locations?limit=1000` 응답 기준 +0.2% 수준입니다.
- 건드리지 않는 것:
  - `matched`, `table_counts`, 격자 칸 집계(`station_count`, `charger_count` 등)
  - bbox 판정, 페이지네이션, 필터 옵션
  - 캐시 키와 캐시된 표
- 같은 위치 묶음 목록(`/api/locations?bbox=…`로 칸 안 충전소를 받는 요청)도 같은 `/locations` 경로를 쓰므로 자동으로 포함됩니다.

### 3.3 메모리와 성능 (Render Free 512MiB)

- **계속 남는 메모리**: dict 644개 항목으로 약 0.1MiB 이하입니다. 중앙값 표와 좌표 키 집합은 계산이 끝나면 버립니다.
- **계산 중 순간 메모리**:
  - 프로토타입을 `tracemalloc`으로 쟀을 때 최고 약 86–99MiB였습니다. 원본 열을 다시 만드는 비용이 포함된 값입니다.
  - 실제 구현은 대표 표의 4개 열(10만 행)만 쓰므로 수십 MiB 수준으로 예상합니다. 구현 후 `test_memory_regression.py`에서 확인합니다.
  - 고유 주소 70,191개를 나누는 데 쓰는 임시 메모리는 계산 직후 해제됩니다.
- **요청당 비용**: 행마다 dict 조회 한 번입니다. 최대 1,000행이므로 무시할 수준입니다.
- **첫 요청 지연**: 대표 표를 이미 만든 뒤라면 로컬 기준 약 0.4초가 더 걸립니다. Render에서는 2–3초 정도로 예상합니다. 프로세스당 한 번만 생깁니다.

## 4. 프론트엔드 설계

### 4.1 타입

`frontend/src/api/types.ts`의 `LocationRow`에 선택 필드를 추가합니다.

```ts
coordinate_flag?: 'placeholder' | 'far_from_address' | 'placeholder_far_from_address';
```

- 선택 필드이므로 기존 테스트 fixture를 고칠 필요가 없습니다.
- 서버를 먼저 배포하고 웹이 아직 예전 코드여도 문제없습니다. 예전 웹은 이 필드를 무시합니다.

### 4.2 문구 (한 곳에서 관리)

새 파일 `frontend/src/lib/coordinateQuality.ts`에 문구를 둡니다. 함수 `coordinateNotice(flag)`는 다음을 돌려줍니다.
- 플래그가 없으면 `null`
- 플래그가 있으면 다음 문구

| 값 | 문구 (안) |
|---|---|
| `placeholder` | 원본 좌표가 대략적인 값입니다. 실제 위치와 수 km 차이가 날 수 있습니다. |
| `far_from_address` | 원본 좌표가 주소지에서 100km 넘게 떨어져 있습니다. 위치가 잘못 표시됐을 수 있습니다. |
| `placeholder_far_from_address` | 원본 좌표가 주소지와 멀고 대략적인 값입니다. 위치가 잘못 표시됐을 수 있습니다. |

- 문구 원칙: "오류"라고 단정하지 않고 "~일 수 있습니다"로 씁니다.
- 판정 기준 문서로 연결하는 링크는 넣지 않습니다. 정보창 공간이 좁기 때문입니다.

### 4.3 표시 위치

- **InfoWindow** (`StationMap.tsx`)
  - 주소 바로 아래에 `<p className="geo-coord-note" role="note">` 한 줄을 넣습니다.
  - 플래그가 없으면 이 요소를 렌더링하지 않습니다.
- **선택 충전소 영역** (`MapAnalysisPanel.tsx`)
  - `geo-station-addr` 아래에 같은 요소를 넣습니다.
- **같은 위치 묶음 팝업의 목록 행**
  - 이번 범위에서는 바꾸지 않습니다. 목록에서 충전소를 고르면 위 두 곳에서 안내가 보입니다.
- **스타일** (`global.css`)
  - `.geo-coord-note`: 작은 글씨(12px), 보조 색, 앞에 `ⓘ` 기호를 붙입니다.
  - 경고색과 배경 상자는 쓰지 않습니다.
  - 모바일(390px)에서는 줄바꿈을 허용합니다. 정보창 높이가 한 줄쯤 늘어나는 점은 기존 P3(모바일 정보창 겹침)와 함께 확인합니다.
- **지도 표시 자체는 바꾸지 않습니다.**
  - 점 모양, 색, 격자 묶음, 상태 줄 숫자는 그대로입니다.
  - 의심 좌표를 다른 모양으로 그리거나 지도에서 빼는 일은 별도 결정 사항으로 남깁니다(7절).

## 5. 문서·명세 변경

- `backend/API_SPEC.md`: `/locations` 행과 `/locations/grid`의 `station`에 선택 필드 `coordinate_flag`가 있다고 적고, 판정 기준 요약을 추가합니다.
- `backend/openapi.json`: `LocationRow` 스키마에 `coordinate_flag`를 넣습니다.
  - enum 3개 값, `required`에는 넣지 않습니다.
  - 메타 정보에 `coordinate_quality_rule`을 추가합니다.
  - 예시 응답에 플래그가 있는 행을 하나 넣습니다.
- `backend/examples/locations.json`: 바꾸지 않습니다(구현 후 정정). `examples/`는 당시 실제 응답을 기록으로 보존하는 파일이며 이미 예전 출처·경고 문구를 담고 있어, 이 파일만 다시 만들면 이번 기능과 무관한 항목까지 바뀝니다. 예시 전체 재캡처는 별도 작업으로 둡니다.
- `README.md`, `frontend/README.md`: 지도 동작 설명에 "좌표 품질 안내" 한 줄을 추가합니다.

## 6. 검증 계획

### 6.1 백엔드 (pytest)

새 파일 `backend/tests/test_coordinate_quality.py`에 다음 테스트를 넣습니다.

1. **규칙 단위 테스트** (합성 데이터)
   - 공유 좌표: 3곳·시군구 2개면 해당하고, 3곳이어도 시군구가 1개면 해당하지 않음
   - 소수 1자리: `36.3, 127.3`은 해당하고, `36.3, 127.35`는 해당하지 않음
   - 100km 경계: 99km와 101km
   - 시도 약칭 정규화
2. **실데이터 재현** (스냅샷이 있을 때만 실행하고, CI 픽스처에서는 건너뜀)
   - 건수: `placeholder` 508, `far_from_address` 182, 두 기준 모두 46, 합집합 644, 충전기 3,322
   - 목록 대조: `reports/coordinate_quality_2026-11-13.json`의 `station_id` 집합과 같은지 확인
3. **정상 행 불변**
   - 플래그가 없는 행은 키 목록과 값이 변경 전과 같아야 합니다.
   - `coordinate_flag` 키가 없어야 하고, `null`도 없어야 합니다.
4. **집계 불변**
   - `/locations`의 `matched`와 `pagination`, `/locations/grid`의 칸 수·충전소 수·충전기 수가 같은 요청에서 변경 전과 같아야 합니다.
   - 기존 `test_location_grid.py`, `test_bbox_boundary.py`가 그대로 통과해야 합니다.
5. **필터 적용 시**
   - 삭제 표시, 유형, 지역 필터에서 플래그가 붙은 행의 좌표가 판정 좌표와 같아야 합니다.
   - 좌표가 다르면 플래그를 붙이지 않아야 합니다.
6. **캐시**
   - `coordinate_flags()`가 두 번째 호출부터 같은 객체를 돌려줘야 합니다.
   - `locations_cache`의 바이트 계산이 변경 전과 같아야 합니다.
7. **메모리** (`test_memory_regression.py`에 추가)
   - 플래그 계산을 포함한 `/api/locations` 첫 요청이 기존 메모리 예산 안에 들어야 합니다.
   - 계속 남는 메모리 증가가 1MiB 이하여야 합니다.
8. **응답 크기**
   - `/api/locations?limit=1000` 응답 증가가 1% 이하여야 합니다(현재 측정값은 약 0%).

### 6.2 프론트엔드

1. **단위 테스트** (`tests/coordinate-quality.test.cjs`)
   - `coordinateNotice()`가 값 3개에 맞는 문구를 돌려주는지 확인합니다.
   - `undefined`이거나 알 수 없는 값이면 `null`을 돌려주는지 확인합니다.
2. **브라우저 테스트** (`tests/map-explorer.browser.cjs` 확장, SDK 대체 파일 사용)
   - fixture에 플래그가 있는 행 1개와 없는 행 1개를 둡니다.
   - 플래그 있는 행: 정보창과 패널에 `.geo-coord-note`가 각각 1개씩 보여야 합니다.
   - 플래그 없는 행: 두 곳 모두 0개여야 합니다.
   - 390px 폭에서 안내 줄이 정보창 밖으로 넘치지 않아야 합니다.
3. **기존 회귀**: `npm test` 전체, `tsc`, `vite build`가 통과해야 합니다.

### 6.3 데이터 보존

- `deploy/render/data-manifest.json`의 SHA-256 값과 R2 객체가 바뀌지 않아야 합니다.
- 로컬 `data/processed/charger_info_clean.csv`의 SHA-256을 구현 전후에 비교합니다.
- `deploy/render/tests` 85개가 그대로 통과해야 합니다.

### 6.4 배포 후 실서비스 확인 (승인 후)

- 플래그 있는 충전소 1곳을 확인합니다. 예: `BNBN0144` 논산 강경상업고등학교, 경남 합천 쪽에 찍힘. API 응답에 필드가 있고 정보창과 패널에 안내가 보여야 합니다.
- 정상 충전소 1곳에서는 안내가 없어야 합니다.
- Render Metrics에서 메모리를 확인하고, 첫 지도 요청의 응답 시간을 잽니다.

## 7. 변경 파일과 배포 범위 (예상)

| 구분 | 파일 | 변경 |
|---|---|---|
| 백엔드 | `backend/chargegap_api/data.py` | 상수, `coordinate_flags()` 추가(약 40행) |
| 백엔드 | `backend/chargegap_api/routes.py` | `annotate()` 헬퍼, `/locations`와 grid의 `station`에 적용, 메타 문자열(약 15행) |
| 백엔드 | `backend/tests/test_coordinate_quality.py` | 신규 |
| 백엔드 | `backend/tests/test_memory_regression.py` | 항목 추가 |
| 백엔드 문서 | `backend/API_SPEC.md`, `backend/openapi.json` | 필드 설명 (`examples/locations.json`은 유지) |
| 프론트 | `frontend/src/api/types.ts` | 선택 필드 1개 |
| 프론트 | `frontend/src/lib/coordinateQuality.ts` | 신규, 문구 |
| 프론트 | `frontend/src/components/StationMap.tsx`, `MapAnalysisPanel.tsx` | 안내 한 줄씩 |
| 프론트 | `frontend/src/styles/global.css` | `.geo-coord-note` |
| 프론트 테스트 | `frontend/tests/coordinate-quality.test.cjs`(신규), `map-explorer.browser.cjs`(+fixture) | |
| 문서 | `README.md`, `frontend/README.md` | 지도 동작 한 줄 |

**바꾸지 않는 것**
- 원본 CSV와 R2 데이터, `data-manifest.json`
- Docker와 Compose 설정, `render.yaml`, 환경 변수, CSP
- exit-link-api

**배포 순서**
1. API(`charge-gap-api`)를 먼저 배포합니다. 필드가 추가될 뿐이라 예전 웹도 그대로 동작합니다.
2. 그다음 정적 사이트(`charge-gap`)를 배포합니다.
3. 두 서비스 모두 환경 변수는 바꾸지 않습니다.

## 8. 승인 때 정할 사항

1. 안내 문구 3종(4.2절)을 그대로 쓸지
2. 같은 위치 묶음 팝업 목록에도 표시할지. 기본안은 표시하지 않음입니다.
3. 지도 위 표시 방식 변경 여부(별도 작업)
   - 의심 좌표를 속 빈 점으로 그리기
   - 지도에서만 제외하고 상태 줄에 개수 표시
4. 원천 기관(한국환경공단)에 644곳 목록을 오류 신고할지

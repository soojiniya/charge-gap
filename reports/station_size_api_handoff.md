# Claude 연결 명세

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

위 예시는 data와 핵심 meta만 발췌했습니다. 전체 실제 응답은 `examples/station-size-distribution-filtered.json`, 전국 비삭제 응답은 `examples/station-size-distribution.json`입니다. 등록자료 2025-12와 이 API의 충전기 조회 2026-10-15는 다른 기준일입니다. 이 API는 설치일·부족률을 계산하지 않습니다. 신규 PNG는 `outputs/charts_v2_report/`에 따로 보관하며 기존 `/api/charts`의 10개 고정 PNG 목록은 유지됩니다.

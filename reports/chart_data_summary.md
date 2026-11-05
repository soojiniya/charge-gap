# CHARGE GAP 그래프 데이터 및 검증

- 작성 시각: 2026-10-15T04:43:53+09:00
- 원본 Excel 3개, API 원본 CSV 및 기존 정제 CSV의 SHA-256이 제작 전후 일치합니다.
- PNG 10개 모두 Pillow 디코딩 검증, 최소 150dpi 이상 검사(실제 200dpi), 비어 있지 않은 픽셀 검사를 통과했습니다.
- 그림 전체의 제목·각주·범례 영역이 캔버스 안에 들어오는지 검사했습니다. 이후 축·레이블은 이미지로 시각 검토합니다.
- 합계뿐 아니라 유형·지역·운영기관·히스토그램 구간·히트맵의 지역별 실제 건수를 상세 정제 CSV와 대조했습니다.
- 임의 표본 추출, 가상 좌표·가상 측정값·정의 불명 코드 재분류를 하지 않았습니다. 표시하는 0은 실제 부분집합의 계산된 건수입니다.

| 번호 | 파일 | 기준 | 분모/단위 |
|---|---|---|---|
| 1 | 01_ev_registration_top10.png | 2025년 12월 | 등록 대수 / 대 |
| 2 | 02_ev_vehicle_type_donut.png | 2025년 12월 | 899,101대 |
| 3 | 03_ev_commercial_stacked.png | 2025년 12월 | 899,101대 |
| 4 | 04_chargers_by_region.png | 2026년 10월 15일 04:16–04:19 KST | 527,433기, N/Y 분리 |
| 5 | 05_station_location_scatter.png | 2026년 10월 15일 04:16–04:19 KST | 101,091곳 |
| 6 | 06_charger_type_pie.png | 2026년 10월 15일 04:16–04:19 KST | 비삭제 523,312기 |
| 7 | 07_charger_output_histogram.png | 2026년 10월 15일 04:16–04:19 KST | 비삭제 중 양수 출력 523,143기 |
| 8 | 08_operator_chargers_top10.png | 2026년 10월 15일 04:16–04:19 KST | 정제된 342개 ID·명칭 조합 중 TOP10 |
| 9 | 09_annual_charger_installation_trend.png | 2011~2026년 연도 통계; 2026 부분 연도; 파일명 날짜 2026-10-15 | 별도 연간/누적 통계 / 기 |
| 10 | 10_regional_output_heatmap.png | 2026년 10월 15일 04:16–04:19 KST | 지역 내 비삭제 충전기 / %·기 |

## 운영기관 공백 정리

{"original_summary_pairs": 356, "clean_pairs": 342, "rule": "기관 ID·운영기관명의 앞뒤 공백만 정리"}
기존 요약은 원문 명칭의 앞뒤 공백을 별도 조합으로 보존했습니다. 그래프에서는 상세 정제 CSV와 같도록 앞뒤 공백만 정리하고 재집계했으며, 기존 CSV를 수정하지 않았습니다. 파워큐브/파워큐브코리아처럼 실제로 다른 표기는 그대로 구분합니다.

## 차트별 실제 계산값

### 1. 01_ev_registration_top10.png

```json
{
  "national": 899101,
  "top10_total": 744793,
  "ranking": [
    {
      "region_name_2025": "경기",
      "ev_registration_count": 207075
    },
    {
      "region_name_2025": "서울",
      "ev_registration_count": 101331
    },
    {
      "region_name_2025": "인천",
      "ev_registration_count": 79860
    },
    {
      "region_name_2025": "경남",
      "ev_registration_count": 65934
    },
    {
      "region_name_2025": "제주",
      "ev_registration_count": 61063
    },
    {
      "region_name_2025": "부산",
      "ev_registration_count": 60687
    },
    {
      "region_name_2025": "경북",
      "ev_registration_count": 45090
    },
    {
      "region_name_2025": "대구",
      "ev_registration_count": 42592
    },
    {
      "region_name_2025": "전남",
      "ev_registration_count": 41322
    },
    {
      "region_name_2025": "충남",
      "ev_registration_count": 39839
    }
  ]
}
```

### 2. 02_ev_vehicle_type_donut.png

```json
{
  "승용": 713835,
  "승합": 14779,
  "화물": 169744,
  "특수": 743
}
```

### 3. 03_ev_commercial_stacked.png

```json
{
  "noncommercial": 730309,
  "commercial": 168792
}
```

### 4. 04_chargers_by_region.png

```json
{
  "all": 527433,
  "not_deleted": 523312,
  "deleted": 4121,
  "regions": [
    {
      "region_code": "41",
      "region_name": "경기",
      "charger_count_all": 155001,
      "charger_count_not_deleted": 154877,
      "charger_count_deleted": 124
    },
    {
      "region_code": "11",
      "region_name": "서울",
      "charger_count_all": 76202,
      "charger_count_not_deleted": 75506,
      "charger_count_deleted": 696
    },
    {
      "region_code": "28",
      "region_name": "인천",
      "charger_count_all": 33866,
      "charger_count_not_deleted": 33434,
      "charger_count_deleted": 432
    },
    {
      "region_code": "12",
      "region_name": "전남광주통합특별시",
      "charger_count_all": 32913,
      "charger_count_not_deleted": 32546,
      "charger_count_deleted": 367
    },
    {
      "region_code": "26",
      "region_name": "부산",
      "charger_count_all": 32765,
      "charger_count_not_deleted": 32475,
      "charger_count_deleted": 290
    },
    {
      "region_code": "48",
      "region_name": "경남",
      "charger_count_all": 31083,
      "charger_count_not_deleted": 30857,
      "charger_count_deleted": 226
    },
    {
      "region_code": "27",
      "region_name": "대구",
      "charger_count_all": 25203,
      "charger_count_not_deleted": 24414,
      "charger_count_deleted": 789
    },
    {
      "region_code": "47",
      "region_name": "경북",
      "charger_count_all": 23226,
      "charger_count_not_deleted": 22933,
      "charger_count_deleted": 293
    },
    {
      "region_code": "44",
      "region_name": "충남",
      "charger_count_all": 22462,
      "charger_count_not_deleted": 22276,
      "charger_count_deleted": 186
    },
    {
      "region_code": "52",
      "region_name": "전북",
      "charger_count_all": 17963,
      "charger_count_not_deleted": 17703,
      "charger_count_deleted": 260
    },
    {
      "region_code": "51",
      "region_name": "강원",
      "charger_count_all": 17813,
      "charger_count_not_deleted": 17680,
      "charger_count_deleted": 133
    },
    {
      "region_code": "43",
      "region_name": "충북",
      "charger_count_all": 17800,
      "charger_count_not_deleted": 17774,
      "charger_count_deleted": 26
    },
    {
      "region_code": "30",
      "region_name": "대전",
      "charger_count_all": 15092,
      "charger_count_not_deleted": 14967,
      "charger_count_deleted": 125
    },
    {
      "region_code": "31",
      "region_name": "울산",
      "charger_count_all": 10694,
      "charger_count_not_deleted": 10587,
      "charger_count_deleted": 107
    },
    {
      "region_code": "50",
      "region_name": "제주",
      "charger_count_all": 8779,
      "charger_count_not_deleted": 8749,
      "charger_count_deleted": 30
    },
    {
      "region_code": "36",
      "region_name": "세종",
      "charger_count_all": 6571,
      "charger_count_not_deleted": 6534,
      "charger_count_deleted": 37
    }
  ]
}
```

### 5. 05_station_location_scatter.png

```json
{
  "station_points": 101091,
  "has_not_deleted_station": 100590,
  "only_deleted_station": 501,
  "multiple_coordinate_pairs_station_count": 9,
  "coordinate_invalid_rows": 0
}
```

### 6. 06_charger_type_pie.png

```json
{
  "denominator": 523312,
  "ac_slow_count": 465025,
  "type11_count": 5584,
  "counts": [
    {
      "charger_type_code": "02",
      "official_definition": "AC완속",
      "charger_count_not_deleted": 465025
    },
    {
      "charger_type_code": "04",
      "official_definition": "DC콤보",
      "charger_count_not_deleted": 43582
    },
    {
      "charger_type_code": "06",
      "official_definition": "DC차데모+AC3상+DC콤보",
      "charger_count_not_deleted": 6449
    },
    {
      "charger_type_code": "11",
      "official_definition": "DC콤보2(버스전용)",
      "charger_count_not_deleted": 5584
    },
    {
      "charger_type_code": "05",
      "official_definition": "DC차데모+DC콤보",
      "charger_count_not_deleted": 1476
    },
    {
      "charger_type_code": "08",
      "official_definition": "DC콤보(완속)",
      "charger_count_not_deleted": 600
    },
    {
      "charger_type_code": "07",
      "official_definition": "AC3상",
      "charger_count_not_deleted": 287
    },
    {
      "charger_type_code": "10",
      "official_definition": "DC콤보+NACS",
      "charger_count_not_deleted": 266
    },
    {
      "charger_type_code": "01",
      "official_definition": "DC차데모",
      "charger_count_not_deleted": 40
    },
    {
      "charger_type_code": "03",
      "official_definition": "DC차데모+AC3상",
      "charger_count_not_deleted": 3
    }
  ]
}
```

### 7. 07_charger_output_histogram.png

```json
{
  "valid_positive_rows": 523143,
  "missing_rows": 169,
  "median_kw": 7.0,
  "p95_kw": 100.0,
  "mode_kw": 7.0,
  "mode_count": 402997,
  "bin_edges": [
    0.0,
    10.0,
    20.0,
    30.0,
    40.0,
    50.0,
    60.0,
    70.0,
    80.0,
    90.0,
    100.0,
    110.0,
    120.0,
    130.0,
    140.0,
    150.0,
    160.0,
    170.0,
    180.0,
    190.0,
    200.0,
    210.0,
    220.0,
    230.0,
    240.0,
    250.0,
    260.0,
    270.0,
    280.0,
    290.0,
    300.0,
    310.0,
    320.0,
    330.0,
    340.0,
    350.0,
    360.0,
    370.0,
    380.0,
    390.0,
    400.0,
    410.0
  ],
  "bin_counts": [
    449148,
    16333,
    396,
    2100,
    46,
    12721,
    10,
    0,
    0,
    7,
    24421,
    127,
    5077,
    0,
    0,
    115,
    18,
    0,
    22,
    15,
    8585,
    0,
    12,
    0,
    2393,
    0,
    320,
    16,
    0,
    0,
    389,
    0,
    113,
    0,
    0,
    644,
    19,
    0,
    0,
    0,
    96
  ]
}
```

### 8. 08_operator_chargers_top10.png

```json
{
  "operator_pairs_all": 342,
  "top10_total": 323648,
  "top10": [
    {
      "busiId": "PI",
      "busiNm": "GS차지비",
      "charger_count_all": 83138,
      "charger_count_not_deleted": 83132,
      "charger_count_deleted": 6
    },
    {
      "busiId": "PL",
      "busiNm": "플러그링크",
      "charger_count_all": 51327,
      "charger_count_not_deleted": 51319,
      "charger_count_deleted": 8
    },
    {
      "busiId": "EV",
      "busiNm": "에버온",
      "charger_count_all": 47638,
      "charger_count_not_deleted": 47638,
      "charger_count_deleted": 0
    },
    {
      "busiId": "PW",
      "busiNm": "파워큐브",
      "charger_count_all": 36192,
      "charger_count_not_deleted": 36192,
      "charger_count_deleted": 0
    },
    {
      "busiId": "LU",
      "busiNm": "LG유플러스볼트업",
      "charger_count_all": 27030,
      "charger_count_not_deleted": 27030,
      "charger_count_deleted": 0
    },
    {
      "busiId": "PW",
      "busiNm": "파워큐브코리아",
      "charger_count_all": 24456,
      "charger_count_not_deleted": 24456,
      "charger_count_deleted": 0
    },
    {
      "busiId": "HM",
      "busiNm": "휴맥스이브이",
      "charger_count_all": 14805,
      "charger_count_not_deleted": 14805,
      "charger_count_deleted": 0
    },
    {
      "busiId": "CV",
      "busiNm": "채비",
      "charger_count_all": 14391,
      "charger_count_not_deleted": 14388,
      "charger_count_deleted": 3
    },
    {
      "busiId": "HY",
      "busiNm": "현대엔지니어링",
      "charger_count_all": 12409,
      "charger_count_not_deleted": 12409,
      "charger_count_deleted": 0
    },
    {
      "busiId": "SF",
      "busiNm": "(주)스타코프",
      "charger_count_all": 12262,
      "charger_count_not_deleted": 12262,
      "charger_count_deleted": 0
    }
  ]
}
```

### 9. 09_annual_charger_installation_trend.png

```json
{
  "years": [
    2011,
    2012,
    2013,
    2014,
    2015,
    2016,
    2017,
    2018,
    2019,
    2020,
    2021,
    2022,
    2023,
    2024,
    2025,
    2026
  ],
  "annual": [
    4,
    9,
    3,
    35,
    126,
    614,
    5723,
    11581,
    16524,
    9990,
    31512,
    92460,
    111981,
    108435,
    89805,
    61408
  ],
  "cumulative": [
    4,
    13,
    16,
    51,
    177,
    791,
    6514,
    18095,
    34619,
    44609,
    76121,
    168581,
    280562,
    388997,
    478802,
    540210
  ],
  "partial_year": 2026,
  "source_cutoff_date": null
}
```

### 10. 10_regional_output_heatmap.png

```json
{
  "regions": [
    "경기",
    "서울",
    "인천",
    "전남광주통합특별시",
    "부산",
    "경남",
    "대구",
    "경북",
    "충남",
    "충북",
    "전북",
    "강원",
    "대전",
    "울산",
    "제주",
    "세종"
  ],
  "counts": [
    [
      140694,
      578,
      2694,
      7104,
      3764,
      43
    ],
    [
      69540,
      240,
      1541,
      3198,
      976,
      11
    ],
    [
      30720,
      113,
      540,
      1558,
      501,
      2
    ],
    [
      28529,
      128,
      1048,
      2026,
      795,
      20
    ],
    [
      29925,
      206,
      471,
      1426,
      444,
      3
    ],
    [
      26541,
      184,
      738,
      2550,
      828,
      16
    ],
    [
      22608,
      68,
      555,
      856,
      325,
      2
    ],
    [
      18465,
      84,
      977,
      2249,
      1149,
      9
    ],
    [
      19010,
      102,
      567,
      1708,
      878,
      11
    ],
    [
      15143,
      137,
      658,
      1272,
      558,
      6
    ],
    [
      14666,
      123,
      476,
      1692,
      730,
      16
    ],
    [
      14630,
      55,
      531,
      1703,
      751,
      10
    ],
    [
      13510,
      63,
      427,
      730,
      232,
      5
    ],
    [
      9461,
      45,
      237,
      617,
      222,
      5
    ],
    [
      6442,
      11,
      1104,
      900,
      285,
      7
    ],
    [
      5993,
      9,
      174,
      206,
      149,
      3
    ]
  ],
  "row_percentages": [
    [
      90.84241042892101,
      0.37319937757058824,
      1.739444849784022,
      4.586865706334704,
      2.430315669854142,
      0.027763967535528195
    ],
    [
      92.09864116758934,
      0.3178555346594973,
      2.0408974121261885,
      4.235424999337801,
      1.2926125076152888,
      0.014568378671893624
    ],
    [
      91.88251480528803,
      0.3379793025064306,
      1.6151223305617037,
      4.6599270203983965,
      1.4984746066878027,
      0.0059819345576359395
    ],
    [
      87.65746942788668,
      0.39328949794137524,
      3.22005776439501,
      6.225035334603331,
      2.4426964911202607,
      0.06145148405333989
    ],
    [
      92.14780600461894,
      0.6343341031562741,
      1.4503464203233256,
      4.3910700538876055,
      1.3672055427251733,
      0.009237875288683603
    ],
    [
      86.01289820786208,
      0.5962990569400783,
      2.391677739248793,
      8.26392714781087,
      2.6833457562303527,
      0.0518520919078329
    ],
    [
      92.60260506266896,
      0.27852871303350535,
      2.273285819611698,
      3.506184975833538,
      1.3312034078807242,
      0.008192020971573687
    ],
    [
      80.51715867963198,
      0.3662843936685126,
      4.260236340644486,
      9.806828587624821,
      5.010247241965726,
      0.03924475646448349
    ],
    [
      85.3384808762794,
      0.45789190159813253,
      2.5453402765307955,
      7.667444783623631,
      3.9414616627760823,
      0.04938049919195547
    ],
    [
      85.19747946438618,
      0.7707887926184315,
      3.7020366827950943,
      7.15652076066164,
      3.1394171261393042,
      0.03375717339934736
    ],
    [
      82.8447155849291,
      0.6947974919505169,
      2.6888098062475287,
      9.557702084392476,
      4.123594870925832,
      0.09038016155453878
    ],
    [
      82.74886877828054,
      0.31108597285067874,
      3.003393665158371,
      9.632352941176471,
      4.247737556561086,
      0.056561085972850686
    ],
    [
      90.26525021714438,
      0.4209260372820205,
      2.8529431415781388,
      4.877396939934522,
      1.5500768357052181,
      0.03340682835571591
    ],
    [
      89.36431472560687,
      0.42504958911873053,
      2.238594502691981,
      5.827902144139038,
      2.0969113063190705,
      0.04722773212430339
    ],
    [
      73.63127214538805,
      0.12572865470339467,
      12.618584981140701,
      10.286889930277745,
      3.2575151445879533,
      0.08000914390216024
    ],
    [
      91.72023262932353,
      0.13774104683195593,
      2.6629935720844813,
      3.15273951637588,
      2.2803795531068256,
      0.04591368227731864
    ]
  ],
  "output_unknown_total": 169,
  "denominator": 523312
}
```

## 입력 무결성

| 입력 파일 | SHA-256 |
|---|---|
| <프로젝트 폴더>\data\raw\2025년_12월_자동차_등록자료_통계.xlsx | 63edcfe041d50517139c86f935c98d358aff142077a53db85d4ea72bc6c88582 |
| <프로젝트 폴더>\data\raw\우리 지역 급속 충전 여건_2026-10-15.xlsx | 2ec158c31b7dc688020a3b83f8e1aace7a34474e13563abb9982f8d96f263006 |
| <프로젝트 폴더>\data\raw\충전기 설치 성장 추세_2026-10-15.xlsx | aa8cffe49bd71354092d356783927981c194187ae8fdb352e32c79385b48de1c |
| <프로젝트 폴더>\data\raw\charger_info_raw.csv | b98fbba0cf7f2c2df7ecd33b66190a3eb59a7f8826604b7811d8e1cc35845d5c |
| <프로젝트 폴더>\data\processed\charger_by_region.csv | ce50e9f5b60fdcdefbc1bb032307f224c6798fe6ccd8a630cf53175d776ffddb |
| <프로젝트 폴더>\data\processed\charger_coordinate_issues.csv | 22cc0b0f9542e0c1d333396ce663d6a3be33e9a5ebdd442ad4315cd50c9d5374 |
| <프로젝트 폴더>\data\processed\charger_duplicate_rows.csv | ed1cd3242ca43310c297dfedc4dceca2f06633f06037fdf83a5378e9ad8ac6c0 |
| <프로젝트 폴더>\data\processed\charger_identity_issues.csv | 22cc0b0f9542e0c1d333396ce663d6a3be33e9a5ebdd442ad4315cd50c9d5374 |
| <프로젝트 폴더>\data\processed\charger_info_clean.csv | 6cf8e89777a7720fdbb9f6800e555424896d870c4f45a6c5bde2f8012c5d00dd |
| <프로젝트 폴더>\data\processed\charger_installation_trend.csv | 7bf139ea609e6b4b7084e0a1aac65ed687f10b9094e4aee6b00697c8edd8e976 |
| <프로젝트 폴더>\data\processed\charger_operator_summary.csv | 642ddef41d69fadf50c8d9bfde16e2603cdf6901ed8675e5ab93b7da6a847d88 |
| <프로젝트 폴더>\data\processed\charger_output_summary.csv | fed2c362344735d7ebefbbada1b5d1c21776706ea4a26e700f0ed37d125c1ada |
| <프로젝트 폴더>\data\processed\charger_region_output_excel.csv | 71ea57d6cb6e8ecaecca9604dace3f60fb8f989355eb0d3a324a97d3c8db586e |
| <프로젝트 폴더>\data\processed\charger_region_summary.csv | faf9d4dae842eb3c1701eacd47d5fbb26d11752a787d2bc1e0cc835107ce2c61 |
| <프로젝트 폴더>\data\processed\charger_type_summary.csv | 4bd274d37ba7894af8230479f2c5c79d49fd6a766a0a65d6a5add25df199313b |
| <프로젝트 폴더>\data\processed\ev_registration_by_region_2025.csv | 2be3140319d5cc20766e598cba8f356c577b986d4ce4d3134c9f4dad8bfef075 |
| <프로젝트 폴더>\data\processed\region_comparison_2025_registration_2026_chargers.csv | 85cf4285ca08625c673507793f14bc8eae86cf2f23979dd49422d4fb3f3f0a5c |

## 검증 항목

- 통과: no_existing_chart_outputs
- 통과: no_existing_chart_analysis.md
- 통과: no_existing_chart_data_summary.md
- 통과: ev_total
- 통과: ev_reference_month
- 통과: api_total
- 통과: api_no_duplicate_keys
- 통과: api_16_regions
- 통과: api_summary_counts_16
- 통과: api_summary_date_16
- 통과: api_summary_counts_10
- 통과: api_summary_date_10
- 통과: api_summary_counts_342
- 통과: api_summary_date_342
- 통과: api_summary_counts_40
- 통과: api_summary_date_40
- 통과: detailed_reconcile_zcode
- 통과: detailed_reconcile_chgerType
- 통과: operators_reconcile_detail
- 통과: 01_ev_registration_top10.png_figure_text_in_bounds — []
- 통과: 01_ev_registration_top10.png_png_dpi — (199.9996, 199.9996)
- 통과: 01_ev_registration_top10.png_nonempty_pixels
- 통과: vehicle_types_sum
- 통과: 02_ev_vehicle_type_donut.png_figure_text_in_bounds — []
- 통과: 02_ev_vehicle_type_donut.png_png_dpi — (199.9996, 199.9996)
- 통과: 02_ev_vehicle_type_donut.png_nonempty_pixels
- 통과: 03_ev_commercial_stacked.png_figure_text_in_bounds — []
- 통과: 03_ev_commercial_stacked.png_png_dpi — (199.9996, 199.9996)
- 통과: 03_ev_commercial_stacked.png_nonempty_pixels
- 통과: 04_chargers_by_region.png_figure_text_in_bounds — []
- 통과: 04_chargers_by_region.png_png_dpi — (199.9996, 199.9996)
- 통과: 04_chargers_by_region.png_nonempty_pixels
- 통과: valid_coordinates
- 통과: station_points_count
- 통과: station_not_deleted_count
- 통과: 05_station_location_scatter.png_figure_text_in_bounds — []
- 통과: 05_station_location_scatter.png_png_dpi — (199.9996, 199.9996)
- 통과: 05_station_location_scatter.png_nonempty_pixels
- 통과: official_types_verified
- 통과: 06_charger_type_pie.png_figure_text_in_bounds — []
- 통과: 06_charger_type_pie.png_png_dpi — (199.9996, 199.9996)
- 통과: 06_charger_type_pie.png_nonempty_pixels
- 통과: histogram_bins_match_output_summary
- 통과: 07_charger_output_histogram.png_figure_text_in_bounds — []
- 통과: 07_charger_output_histogram.png_png_dpi — (199.9996, 199.9996)
- 통과: 07_charger_output_histogram.png_nonempty_pixels
- 통과: 08_operator_chargers_top10.png_figure_text_in_bounds — []
- 통과: 08_operator_chargers_top10.png_png_dpi — (199.9996, 199.9996)
- 통과: 08_operator_chargers_top10.png_nonempty_pixels
- 통과: annual_cumulative_sum
- 통과: partial_year_flag
- 통과: 09_annual_charger_installation_trend.png_figure_text_in_bounds — []
- 통과: 09_annual_charger_installation_trend.png_png_dpi — (199.9996, 199.9996)
- 통과: 09_annual_charger_installation_trend.png_nonempty_pixels
- 통과: heatmap_counts_include_unknown
- 통과: heatmap_region_41
- 통과: heatmap_region_11
- 통과: heatmap_region_28
- 통과: heatmap_region_12
- 통과: heatmap_region_26
- 통과: heatmap_region_48
- 통과: heatmap_region_27
- 통과: heatmap_region_47
- 통과: heatmap_region_44
- 통과: heatmap_region_43
- 통과: heatmap_region_52
- 통과: heatmap_region_51
- 통과: heatmap_region_30
- 통과: heatmap_region_31
- 통과: heatmap_region_50
- 통과: heatmap_region_36
- 통과: 10_regional_output_heatmap.png_figure_text_in_bounds — []
- 통과: 10_regional_output_heatmap.png_png_dpi — (199.9996, 199.9996)
- 통과: 10_regional_output_heatmap.png_nonempty_pixels
- 통과: input_unchanged_2025년_12월_자동차_등록자료_통계.xlsx
- 통과: input_unchanged_우리 지역 급속 충전 여건_2026-10-15.xlsx
- 통과: input_unchanged_충전기 설치 성장 추세_2026-10-15.xlsx
- 통과: input_unchanged_charger_info_raw.csv
- 통과: input_unchanged_charger_by_region.csv
- 통과: input_unchanged_charger_coordinate_issues.csv
- 통과: input_unchanged_charger_duplicate_rows.csv
- 통과: input_unchanged_charger_identity_issues.csv
- 통과: input_unchanged_charger_info_clean.csv
- 통과: input_unchanged_charger_installation_trend.csv
- 통과: input_unchanged_charger_operator_summary.csv
- 통과: input_unchanged_charger_output_summary.csv
- 통과: input_unchanged_charger_region_output_excel.csv
- 통과: input_unchanged_charger_region_summary.csv
- 통과: input_unchanged_charger_type_summary.csv
- 통과: input_unchanged_ev_registration_by_region_2025.csv
- 통과: input_unchanged_region_comparison_2025_registration_2026_chargers.csv
- 통과: ten_pngs
- 통과: histogram_drawn_bin_tops
- 통과: histogram_drawn_positive_bins
- 통과: 07_charger_output_histogram.png_figure_text_in_bounds — []
- 통과: 07_charger_output_histogram.png_png_dpi — (199.9996, 199.9996)
- 통과: 07_charger_output_histogram.png_nonempty_pixels
- 통과: input_unchanged_2025년_12월_자동차_등록자료_통계.xlsx
- 통과: input_unchanged_우리 지역 급속 충전 여건_2026-10-15.xlsx
- 통과: input_unchanged_충전기 설치 성장 추세_2026-10-15.xlsx
- 통과: input_unchanged_charger_info_raw.csv
- 통과: input_unchanged_charger_by_region.csv
- 통과: input_unchanged_charger_coordinate_issues.csv
- 통과: input_unchanged_charger_duplicate_rows.csv
- 통과: input_unchanged_charger_identity_issues.csv
- 통과: input_unchanged_charger_info_clean.csv
- 통과: input_unchanged_charger_installation_trend.csv
- 통과: input_unchanged_charger_operator_summary.csv
- 통과: input_unchanged_charger_output_summary.csv
- 통과: input_unchanged_charger_region_output_excel.csv
- 통과: input_unchanged_charger_region_summary.csv
- 통과: input_unchanged_charger_type_summary.csv
- 통과: input_unchanged_ev_registration_by_region_2025.csv
- 통과: input_unchanged_region_comparison_2025_registration_2026_chargers.csv
- 통과: ten_pngs
- 통과: 09_annual_charger_installation_trend.png_figure_text_in_bounds — []
- 통과: 09_annual_charger_installation_trend.png_png_dpi — (199.9996, 199.9996)
- 통과: 09_annual_charger_installation_trend.png_nonempty_pixels
- 통과: input_unchanged_2025년_12월_자동차_등록자료_통계.xlsx
- 통과: input_unchanged_우리 지역 급속 충전 여건_2026-10-15.xlsx
- 통과: input_unchanged_충전기 설치 성장 추세_2026-10-15.xlsx
- 통과: input_unchanged_charger_info_raw.csv
- 통과: input_unchanged_charger_by_region.csv
- 통과: input_unchanged_charger_coordinate_issues.csv
- 통과: input_unchanged_charger_duplicate_rows.csv
- 통과: input_unchanged_charger_identity_issues.csv
- 통과: input_unchanged_charger_info_clean.csv
- 통과: input_unchanged_charger_installation_trend.csv
- 통과: input_unchanged_charger_operator_summary.csv
- 통과: input_unchanged_charger_output_summary.csv
- 통과: input_unchanged_charger_region_output_excel.csv
- 통과: input_unchanged_charger_region_summary.csv
- 통과: input_unchanged_charger_type_summary.csv
- 통과: input_unchanged_ev_registration_by_region_2025.csv
- 통과: input_unchanged_region_comparison_2025_registration_2026_chargers.csv
- 통과: ten_pngs

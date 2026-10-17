# CHARGE GAP 데이터 품질 보고서

- 수집 시작: 2026-10-15T04:16:31+09:00
- 수집 완료: 2026-10-15T04:19:29+09:00
- 시작/종료 API totalCount: 527433 / 527433
- 실제 원본 행 수: 527,433
- 정제 행 수: 527,433
- 식별키 중복 제거: 0
- 최종 식별 가능한 충전기 수: 527,433
- 전국 고유 충전소 수(statId): 101,091
- 식별키 결측 행 수(집계 제외, 정제 데이터에는 보존): 0
- 좌표 오류/결측 행 수(정제 데이터에 보존): 0
- 유효하지 않은 지역코드: 32,913
- 여러 지역에 나타난 충전소 ID: 0

## 주요 컬럼 결측

| 컬럼 | 원본 결측(공백 포함) | 정제 결측 |
|---|---:|---:|
| statNm | 0 | 0 |
| statId | 0 | 0 |
| chgerId | 0 | 0 |
| chgerType | 0 | 0 |
| powerType | 527,433 | 527,433 |
| addr | 1 | 1 |
| lat | 0 | 0 |
| lng | 0 | 0 |
| zcode | 0 | 0 |
| busiId | 0 | 0 |
| busiNm | 0 | 0 |
| stat | 0 | 0 |
| statUpdDt | 2,759 | 2,759 |
| useTime | 3,344 | 3,344 |
| parkingFree | 78 | 78 |
| note | 449,052 | 449,052 |

## 원본 추가 필드

addrDetail, location, bnm, busiCall, lastTsdt, lastTedt, nowTsdt, output, method, zscode, kind, kindDetail, limitYn, limitDetail, delYn, delDetail, trafficYn, year, floorNum, floorType, maker

## 지역별 현황

| 지역코드 | 지역 | 충전기 수 | 충전소 수 |
|---|---|---:|---:|
| 11 | 서울 | 76,202 | 13,035 |
| 26 | 부산 | 32,765 | 5,172 |
| 27 | 대구 | 25,203 | 4,112 |
| 28 | 인천 | 33,866 | 5,275 |
| 30 | 대전 | 15,092 | 2,783 |
| 31 | 울산 | 10,694 | 2,101 |
| 36 | 세종 | 6,571 | 1,041 |
| 41 | 경기 | 155,001 | 25,022 |
| 43 | 충북 | 17,800 | 3,836 |
| 44 | 충남 | 22,462 | 5,054 |
| 47 | 경북 | 23,226 | 5,878 |
| 48 | 경남 | 31,083 | 7,006 |
| 50 | 제주 | 8,779 | 3,219 |
| 51 | 강원 | 17,813 | 4,498 |
| 52 | 전북 | 17,963 | 4,934 |
| unknown | 미확인 | 32,913 | 8,125 |

## 검증 기준 및 해석

- 원본 CSV는 모든 API item 필드를 문자열로 보존하고 페이지 번호와 조회 시각만 추가했습니다.
- 원본 필드에 없던 요청 컬럼은 빈 값으로 추가했습니다. 모든 XML item 필드 값은 페이지별 JSON 체크포인트에도 보존했습니다.
- 중복 기준은 공백을 정리한 (statId, chgerId)입니다. 충돌 시 첫 조회 행을 유지하며 제거 행은 별도 CSV에 기록합니다.
- 식별키가 없는 행은 서로 중복 처리하지 않습니다. 미확인 식별키는 충전기 수 집계에서 제외합니다.
- 유효하지 않은 좌표는 삭제하지 않으며 data/processed/charger_coordinate_issues.csv에 별도 기록합니다.
- 좌표 검사는 위도 33~39.5, 경도 124~132의 넓은 범위 검사입니다. 행정경계 내 존재 여부는 판단하지 않습니다.
- 지역코드 42/45는 원본을 보존하고 파생 지역코드에서 51/52로 대응합니다.
- powerType은 원본 그대로 보존하며 빈 값을 용량으로 추정하지 않습니다. 별도로 제공된 API output 필드는 power_kw에 수치화합니다.
- 알려진 충전기 유형 검사는 01~10, 상태 검사는 0~6 및 9로 제한합니다. 범위 밖 값은 삭제하지 않고 검토 대상으로 남깁니다.
- statUpdDt는 상태 갱신일시이며 설치일이 아닙니다. 설치 연도나 연도별 증가량을 계산하지 않았습니다.
- 현재 조회 시점의 운영 데이터입니다. 2025년 12월 당시 설치 현황을 뜻하지 않습니다.
- 시작/종료 건수와 고유 식별키 수를 비교했습니다. 실시간 페이지 API는 단일 시점 스냅샷을 보장하지 않습니다.

## 상세 품질 수치

```json
{
  "missing_by_field": {
    "statNm": 0,
    "statId": 0,
    "chgerId": 0,
    "chgerType": 0,
    "powerType": 527433,
    "addr": 1,
    "lat": 0,
    "lng": 0,
    "zcode": 0,
    "busiId": 0,
    "busiNm": 0,
    "stat": 0,
    "statUpdDt": 2759,
    "useTime": 3344,
    "parkingFree": 78,
    "note": 449052
  },
  "duplicate_removed": 0,
  "missing_identity_rows": 0,
  "invalid_coordinates": 0,
  "invalid_region_codes": 32913,
  "legacy_region_rows": 0,
  "charger_count": 527433,
  "station_count": 101091,
  "clean_rows": 527433,
  "coordinate_issue_counts": {
    "valid": 527433
  },
  "missing_after_clean": {
    "statNm": 0,
    "statId": 0,
    "chgerId": 0,
    "chgerType": 0,
    "powerType": 527433,
    "addr": 1,
    "lat": 0,
    "lng": 0,
    "zcode": 0,
    "busiId": 0,
    "busiNm": 0,
    "stat": 0,
    "statUpdDt": 2759,
    "useTime": 3344,
    "parkingFree": 78,
    "note": 449052
  },
  "invalid_nonmissing_statUpdDt": 0,
  "unknown_nonmissing_chgerType": 5587,
  "unknown_nonmissing_stat": 0,
  "power_kw_missing_or_nonpositive": 169,
  "stations_in_multiple_regions": 0
}
```

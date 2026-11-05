# CHARGE GAP 제출 전 최종 종합 검증

**최종 판정: CONDITIONAL PASS**

검증 대상: `<프로젝트 폴더>`  
보고서 완료 시각: 2026-10-17T13:23:06.372131+09:00 (KST)

핵심 원본 데이터와 Flask API 집계, TypeScript 검사·빌드는 통과했다. 다만 회귀선 표시 계산, 연도 필터에 따른 분석 문구, 모바일 확대 모달과 일부 툴팁·너비 문제가 남아 있어 **현재 상태를 필수 항목 전체 통과(PASS)로 제출 승인하지 않는다.** 핵심 수집 데이터와 API 자체가 잘못된 상태는 아니므로 프로젝트 전체 FAIL과는 구분한다. 필수 수정 및 해당 항목 재확인 후 제출 가능하다. 외부 공개 배포는 의존성 보안 조치도 선행해야 한다.

이번 이어받기에서는 기존 검증을 재실행하지 않고 기록을 검토했다. 남아 있던 회귀식의 수학적 대조, 보안 공지의 적용 조건 확인, 최종 해시 대조와 집계·보고서 작성만 수행했다. 코드·데이터·PNG·기존 보고서·의존성 파일을 수정하지 않았다. GitHub 업로드와 Docker 제작은 하지 않았다.

## 1. 집계 방식과 결과

| 전체 검증 항목 | 통과 | 실패 | 미확인 |
|---:|---:|---:|---:|
| 330 | 311 | 11 | 8 |

체크 ID를 기준으로 집계했다. 저장된 데이터/API 체크 250개와 브라우저 체크 35개에 파일별 PNG 확인, 빌드·수학·보안·보존 검토를 더했다. 기존 pytest 82개 통과는 **1개 테스트 세트 항목**으로 계산했다. 실패 개수는 서로 다른 문제 개수가 아니라 체크 실패 수다. 예를 들어 모바일 카드 너비와 모바일 모달은 따로 센다. 참고용 기술 경고도 실패 체크에 포함하되, 아래에서 필수·선택을 구분한다. 미확인은 통과로 간주하지 않는다.

| 분야 | 항목 수 | 통과 | 실패 | 미확인 |
|---|---:|---:|---:|---:|
| api | 188 | 188 | 0 | 0 |
| assignment | 1 | 1 | 0 | 0 |
| browser | 35 | 30 | 5 | 0 |
| build | 5 | 3 | 2 | 0 |
| chart_math | 6 | 5 | 1 | 0 |
| data | 41 | 41 | 0 | 0 |
| frontend_math | 3 | 3 | 0 | 0 |
| motion | 1 | 1 | 0 | 0 |
| png | 20 | 20 | 0 | 0 |
| preservation | 1 | 1 | 0 | 0 |
| security | 17 | 14 | 2 | 1 |
| structure | 5 | 4 | 1 | 0 |
| unverified | 7 | 0 | 0 | 7 |

## 2. 데이터 정확성

| 기준 | 확인값 | 결과 |
|---|---:|---|
| 전기차 등록, 2025-12 | 899,101대 | PASS |
| 충전기 API 조회, 2026-10-15 | 527,433기 | PASS |
| 고유 statId | 101,091곳 | PASS |
| delYn=Y | 4,121기 | PASS |
| delYn=N | 523,312기 | PASS |
| N 충전기가 있는 고유 충전소 | 100,590곳 | PASS |
| output 빈 값 / 수치화 결측 | 169건 / 169건 | PASS |

- 지역별 원본·요약 CSV 건수와 전국 합계, 현재 16개 지역 코드·명칭이 일치한다. 등록 자료는 17개 지역을 그대로 유지하며 29 광주·46 전남을 현재 코드 12로 임의 분리·변환하지 않는다.
- 충전기 식별자 `(statId, chgerId)` 결측·중복 검사 통과. 공식 커넥터 유형별 합계 527,433기와 정의가 일치하며 유형 09는 관측 0건이다.
- 운영기관 요약 CSV의 공백 표기 차이 356개 조합을 앞뒤 공백만 정리하면 API와 같은 **342개 `(busiId,busiNm)` 조합**이며 합계가 일치한다. 다른 명칭을 임의 통합하거나 기관별 충전소 수를 전국 값으로 단순 합산하지 않는다.
- EV 차종 합계 및 사업용·비사업용 합계가 각 지역 등록 대수와 일치한다. 전국 사업용은 168,792대, 비율은 18.77341923%이다.
- 설치 통계는 연간값 누적합과 누적값이 일치한다. 2025년 478,802기, 2026년 부분 연도 540,210기이다. 현재 API 재고 527,433기와 다른 모집단이며 동일 총수로 맞추지 않는다.
- 삭제 전체·비삭제·삭제만 및 4중 필터의 API matched·집계 합계가 일치한다. N은 실제 이용 가능 상태가 아니며 statUpdDt는 설치일이 아니다.
- 등록 2025-12와 충전기 2026-10-15를 서로 나눈 부족률·차량/충전기 비율 계산은 검토한 코드와 화면에서 발견하지 않았다. 충전소당 충전기는 같은 충전기 스냅샷 내 계산이므로 허용되는 지표다.

## 3. Flask API와 테스트

저장된 최종 pytest 결과: **82 passed, 실패·오류·skipped 0, 22.06초**. 이 이어받기에서는 다시 실행하지 않았다. 신규 집계/API 동작 확인, 잘못된 요청, 빈 결과, 경계 사분위수·수염 테스트를 포함한다.

실제 로컬 HTTP 기록은 **56회**다. 다음은 각 기본 요청의 1회 관측값으로, 장기 성능 보장은 아니다.

| 엔드포인트 | HTTP | 응답시간 ms |
|---|---:|---:|
| /api/overview | 200 | 529.2 |
| /api/ev-registration | 200 | 22.9 |
| /api/charger-regions | 200 | 332.4 |
| /api/charger-types | 200 | 321.5 |
| /api/charger-output | 200 | 300.2 |
| /api/operators | 200 | 333.1 |
| /api/growth | 200 | 15.2 |
| /api/locations | 200 | 713.2 |
| /api/charts | 200 | 26.7 |
| /api/station-size-distribution | 200 | 291.8 |

- 전체 측정 범위 1.7–767.0ms. 저장된 requests에 필터별 시간·상태·바이트 수가 있다. 과거 v2 보고서의 Flask test-client 지연과 이번 실제 HTTP 지연을 섞어 비교하지 않았다.
- JSON data/meta, source·기준일, 오류 error/code/parameter 검증 통과. 14종 잘못된 요청에 HTTP 400을 확인했다.
- 유형 09의 정상 빈 결과, 지역·유형·삭제·운영기관 복합 필터를 확인했다. 운영기관 200개×2페이지에서 342개 조합과 전국 합계를 재구성했다.
- 지도 locations 5개씩 2페이지에서 ID 중복이 없고 bbox 안 좌표이며 next_page=2가 맞다. 잘못된 bbox·NaN·limit 초과를 거부한다.
- 박스플롯은 필터 후 `(zcode,statId)`별 고유 chgerId 수를 계산한다. all/N/Y 각 16개 지역의 선형 보간 사분위수와 포함 경계 1.5×IQR 수염·이상치 빈도를 독립 대조했다. N 표본 100,590곳, 지역별 이상치 합계 9,748곳이다. 이상치는 오류로 판정하거나 제거한 값이 아니다.
- 브라우저 4중 필터(세종 36, 유형 04, N, 기관 ME)에서 70기·37곳, Q1=1·중앙값=2·Q3=2·수염=1~2·이상치 5곳이 API 및 툴팁과 일치했다.

## 4. 주요 그래프 10개 최종 결과

| # | 그래프 | 데이터·계산·표현 검증 | 최종 결과 |
|---:|---|---|---|
| 1 | 지역별 EV 등록 가로 막대 | 17개 지역, 경기 207,075대, 전국 합계·정렬·17개 고정 분석 확인 | PASS, 모든 툴팁 전수 확인은 미실시 |
| 2 | 차종별 도넛 | 승용 713,835 / 화물 169,744 / 승합 14,779 / 특수 743대. 광주 필터 19,115대에 따라 구성 갱신 | PASS |
| 3 | 사업용 비율 점 / 100% 누적 / 대수 | 세 보기 전환, 17개 비율 내림차순·전국 18.8%선·인천 40.1%·충남 7.1% 확인 | 수치 PASS, 모바일 너비 FAIL |
| 4 | 충전소·충전기 산점도 + 회귀선 | 16개 점·r·R²·회귀계수는 맞음. 경기 클릭 필터·툴팁 정상. 선의 절편 클램프로 실제 OLS와 불일치 | FAIL, 필수 수정 |
| 5 | 충전소당 충전기 박스플롯 | Q1·중앙값·Q3·수염·이상치 빈도와 툴팁 일치. all 선택일 때 N을 쓰는 예외가 화면에 명시됨 | 수치 PASS, 모바일 모달·너비 FAIL |
| 6 | 유형별 도넛 | 상위4+기타 합계와 API 527,433기 일치. 커넥터를 kW 구간으로 임의 분류하지 않음 | PASS |
| 7 | 출력 히스토그램 + KDE | all 양수 527,264기, 결측 169기. log10 폭·대역폭 .125, 빈도 가중 Gaussian KDE 독립 대조. 19개 bin·곡선 존재, NaN/Infinity path 0 | PASS, 로그 y·선형 y 전환 정상 |
| 8 | 지역별 출력 구성 히트맵 | 16개 행·6구간, 경기 all <30kW 140,810/155,001=90.84% 확인. 툴팁은 정확하나 첫 행 상단 잘림 | 수치 PASS, 툴팁 FAIL |
| 9 | 누적 설치 영역 | 실제 원본 누적값·2026 부분 연도 표시 정상. 2024 시작 필터의 최초 10만 기 돌파 설명은 틀림 | 수치 PASS, 설명 FAIL |
| 10 | 기관 트리맵 | 상위20+기타=matched, ID·명칭 조합 유지. GS차지비 83,138기·15.76% 툴팁과 셀 클릭 PI 필터 정상 | PASS |

히트맵은 화면의 숫자는 지역 내 비율이지만 **색은 열별 상대 정규화**이고 범례에 이를 명시한다. Python v2 히트맵의 공통 0~100% 색척도와 색상을 직접 비교하면 안 된다. 화면 반올림 숫자 합계가 100.0%에서 조금 벗어날 수 있으나 원시 건수 기반 비율 합계는 100%이다.

추가 연간 설치 막대와 2026 빗금/부분 연도 표시, OSM 출처를 가진 지도 타일 로딩·확대가 확인됐다. 줌 11 이상에서 관측한 영역 내 충전소 225/225곳, 일치 충전기 516기 표시가 나타났다. 이는 전국 합계가 아닌 해당 화면 범위다.

## 5. 확인된 오류와 수정 방법

### 제출 전 필수 수정

**F1 [P1] 표시 회귀선이 계산한 회귀식과 다름**

- 위치: `frontend/src/charts/RegionScatter.tsx:102`, Overview·Regional Explorer 및 상세 보기에서 공통 사용.
- 기본 all 데이터의 진짜 OLS: **y = −6,782.633515670139 + 6.290917453093967x**, r=0.9861413429, R²=0.9724747481.
- 코드가 첫 끝점을 `(0, max(0, intercept))`로 바꾼다. 둘째 끝점은 진짜 회귀식의 `x=max(x)×1.04` 값이므로 실제 표시선은 **y=6.030276297477442x**가 된다. 기울기 상대 차이 약 **−4.1431%**. 서울 x=13,035에서 진짜 선 y≈75,219.48, 표시선 y≈78,604.65이다. 가능성이 아니라 코드와 독립 계산으로 확인된 불일치다. 관측점 및 화면 r/R² 자체가 틀린 것은 아니다.
- 수정 방법: 두 끝점을 모두 원래 회귀식 위에 놓고 음수 영역을 clipping하거나, y=0 교점 **x≈1,078.162854**부터 표시한다. intercept만 0으로 바꾸지 않는다. 같은 필터의 점·계수·선 좌표를 함께 재검증해야 한다. 이번에는 수정하지 않았다.

**F2 [P1] 연도 필터 후 전국 최초 도달 시점을 오표기**

- 위치: `frontend/src/analysis/insights.tsx:580`, `:585`.
- `complete.find(cumulative_count >= 100000)`를 필터된 구간에서 실행한다. 2024 시작이면 '처음 넘은 해: 2024년'으로 표시하지만 전국 최초는 **2022년 168,581기**이다.
- 수정 방법: 최초 도달 연도는 전체 시계열에서 계산하거나 '선택 구간 첫 관측 연도'로 문구를 바꾼다. 단순히 선택 구간의 첫 행을 전국 최초로 설명하지 않는다.

**F3 [P1] 390px 박스플롯 확대 모달의 닫기 버튼이 화면 밖**

- 위치: `frontend/src/styles/global.css:1052`, `:1063`, `:1498`, `frontend/src/components/ui/Modal.tsx`, BoxPlot의 고정/초기 SVG 너비.
- 실제 viewport 390px에서 모달 width=**785px**, 닫기 버튼 x=**730~760px**. 오른쪽 차트·버튼을 볼 수 없었다. Esc로는 닫혔으나 터치 사용자를 위한 해결이 아니다.
- 원인: grid/flex의 콘텐츠 최소 너비와 SVG 초기/최소 너비가 모달 폭을 확장한다. 수정 방법: 모달·grid track에 min-width:0, viewport 기반 max-width, 내부 overflow 제어를 적용하고 헤더 닫기 버튼을 항상 화면 안에 유지한다. 수정 후 같은 390px 확대 화면에서 재검증한다.

**F4 [P2] 모바일 카드 안 SVG 너비 초과**

- 위치: `CommercialDotPlot.tsx:70`의 최소 300px, `BoxPlot.tsx:57`의 최소 320px.
- 카드 안 실제 폭 293px에 SVG 300px/320px를 그려 각각 7px/27px 초과한다. 문서 전체 가로 스크롤이 없다는 것만으로 내부 차트가 맞는 것은 아니다.
- 수정 방법: 실제 컨테이너 폭에 맞춰 축·라벨 공간을 줄이거나 차트만 명시적인 수평 스크롤/반응형 viewBox에 넣는다. 제출 화면에서 축·라벨이 잘리지 않아야 한다.

**F5 [P2] 히트맵 첫 행 툴팁 클리핑**

- 위치: `frontend/src/charts/Heatmap.tsx:35`, `:96`.
- 첫 행 툴팁 top≈356px인데 스크롤 부모 top≈450px이다. overflowX:auto의 계산된 overflowY:auto와 항상 위로 배치하는 transform 때문에 제목·일부 수치가 잘린다. 실제 값 오류와는 다르다.
- 수정 방법: 툴팁을 clipping 부모 밖 portal에 표시하거나 경계에 따라 아래 배치하고 좌우를 제한한다. z-index만 높여서는 부모 클리핑을 해결할 수 없다.

### 공개·배포 전에 필수 조치

**S1 [P1] 미해결 의존성 보안 경고**: 아래 6절의 적용 범위를 기준으로 호환되는 보안 패치 버전을 선택하고 lock을 갱신한 뒤 재검증한다. 기존 npm audit 기록이 제시한 후보는 react-router-dom 6.30.6, Vite 6.4.4이지만 이것만으로 모든 전이 의존성 경고가 해소된다고 보증하지 않는다. 무조건적인 `audit fix --force`나 메이저 업그레이드를 권하지 않으며 이번에는 설치·변경하지 않았다.

**S2 [P2] Git 공개 파일 범위 결정**: `.env` 제외 규칙은 있으나 raw·processed·history 대용량 CSV의 제외 규칙이 없다. 211,796,078 / 240,535,251 / 239,975,730바이트 CSV가 확인됐다. 공개할 자료와 별도 배포 자료를 구분하고 환경파일·캐시·가상환경·검증 임시 산출물을 제외한 소스코드 목록을 먼저 정해야 한다. CSV가 공공자료라고 해서 인증키 누출이 확인된 것은 아니다. Git 저장소가 없어 현재 추적 및 과거 커밋 노출은 미확인이다.

### 선택적 개선 / 이식성 준비

- **O1 [P2] 폰트 경고**: IBM Plex Sans KR 일부 woff2 경로가 빌드 시 해결되지 않았다. 원본 설치 자산·생성 CSS 상대경로를 확인하고 한글·브라우저 폴백을 재점검한다. 한글 화면 자체가 전부 깨진 것으로 판정하지 않는다.
- **O2 [P3] 번들 경고**: 메인 JS 약 787.63kB(gzip 231.71kB)가 경고 기준 700kB를 넘는다. 빌드 실패는 아니며 필요하면 공통 차트 라이브러리 분할 등을 검토한다.
- **O3 [P2] Python 이식성**: `scripts/create_report_charts_v2.py:5`, `:21`에 Windows 프로젝트 기본 경로·맑은 고딕 파일 경로가 고정돼 있다. Linux에서 같은 PNG를 재현하려면 인자 기반 경로·사용 가능한 한글 글꼴 탐색 또는 글꼴 포함 정책이 필요하다. 현재 Windows 웹사이트 동작 실패로 보지는 않는다.
- **O4 [확인 필요] 접근성·모션 계측**: SVG 선택의 키보드 대안, 실제 터치 툴팁, prefers-reduced-motion true 상태, 장시간 FPS·CLS는 별도 확인이 필요하다. 코드에 훅이 있다는 사실을 런타임 통과와 혼동하지 않는다.

## 6. 보안 경고의 구체적 영향 범위

직전 npm audit 기록: **5개 패키지(High 4, Moderate 1, Critical 0)**. 의존성 전파 때문에 같은 원인의 경고가 여러 패키지에 집계된다. 독립적인 high 취약점 4개가 현재 페이지에서 모두 악용 가능하다는 뜻은 아니다. 이번에는 저장된 audit와 현재 소스, 보안 공지의 조건을 대조했다. 실제 민감 파일 접근이나 공격 코드는 실행하지 않았다.

| 패키지 | audit 등급 | 현재 프로젝트에서 확인한 범위 |
|---|---|---|
| @remix-run/router | high | 주요 XSS 공지는 loader/action 기반 redirect를 전제로 하며 Declarative BrowserRouter를 명시적으로 제외한다. 현재 main.tsx는 BrowserRouter이고 loader/action redirect가 없다. |
| react-router | high | 위 전이 경고 및 open redirect·SSR 관련 경고가 포함된다. 현재 링크는 고정된 내부 경로, 쿼리는 데이터 필터이며 비신뢰 외부 목적지로 넘기는 navigate/redirect·SSR hydration 경로를 찾지 못했다. |
| react-router-dom 6.28.0 | high | router 경고가 상위 패키지까지 전파된 항목이다. 경고를 제거한 것은 아니며 향후 외부 경로 입력·loader 등을 추가하면 적용 조건이 달라질 수 있다. |
| vite 6.0.3 | high | 개발 서버의 파일 접근/WebSocket·Windows 경로 처리 관련 공지에 포함된다. 현재 vite.config.ts에는 --host/server.host 공개 설정이 없고, 기존 검증은 Vite 개발 서버가 아닌 분리된 정적 빌드+로컬 Flask를 사용했다. 명시적 외부 노출 조건을 전제로 하는 high 공지와, 이전 CORS/launch-editor 위험을 구분해야 한다. |
| esbuild | moderate | 해당 공지는 esbuild serve의 CORS 동작 문제다. 현재 코드는 esbuild serve를 직접 호출하지 않고 Vite 빌드 도구로 간접 사용한다. 브라우저 정적 번들만으로 esbuild 서버가 실행되는 것은 아니다. |

**개발 서버와 정적 배포의 차이**: Vite/esbuild 개발 서버 취약점은 Vite가 만든 정적 JS 파일 자체의 서버 기능이 아니다. 정적 빌드+일반 정적 서버와 Flask API라는 운영 구조에서는 동일한 개발 서버 공격면이 생기지 않는다. 그러나 오래된 로컬 개발 서버를 무해하다고 볼 수는 없다. 특히 Windows launch-editor 공지는 악성 사이트의 요청·실행 중인 개발 middleware·Windows 인증 조건에서 개발자 자격증명 위험을 다루므로, 단순히 localhost 바인딩만으로 전체 경고를 무시해서는 안 된다. 이 환경에서 실제 자격증명 노출이 발생했다는 증거는 없다.

근거:

- [React Router XSS 공지: BrowserRouter 제외 명시](https://github.com/advisories/GHSA-2w69-qvjg-hvjx)
- [Vite WebSocket 파일 읽기 공지와 네트워크 노출 조건](https://github.com/advisories/GHSA-p9ff-h696-f583)
- [Vite 유지관리자 공지: Windows 경로와 파일 접근 우회](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)
- [esbuild 유지관리자 공지: serve의 CORS 문제](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)
- [Windows launch-editor 자격증명 관련 공지](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)

기존 정적 검사에서 환경파일의 인증키 문자열을 소스·프론트엔드 빌드·API 응답과 비교해 일치하는 노출을 찾지 못했다. 보고서에는 키 원문·환경변수 값·키 포함 URL을 기록하지 않았다. 이 결과는 Git 과거 이력 전체에 대한 안전 인증은 아니다.

## 7. 브라우저·반응형·애니메이션

- 5개 페이지를 1440×1000, 1024×900, 390×844에서 직접 접근했다. 15개 페이지/너비 조합 중 일반 화면 기준 13개 통과, 모바일 EV·Infrastructure 내부 SVG 초과 2개 실패였다. 모바일 박스플롯 모달 실패는 별도 체크다. 반응형 뷰포트 에뮬레이션이며 실기기 터치 시험은 아니다.
- 페이지 이동, EV 광주 선택, 비율 점/100%/대수 전환, 복합 필터·초기화, 유형09 빈 결과, 400 안내, 기관 셀 클릭·지역 점 클릭을 대표 사례로 확인했다.
- 박스플롯 확대·데이터 표·툴팁, 등록 그래프의 상세 데이터/출처 탭, 산점도·출력·트리맵 상세 보기를 확인했다. 모든 모달·모든 페이지네이션 버튼을 전수 클릭한 것은 아니다.
- API 연결 불가 안내는 연결 불가능한 주소를 사용한 **별도 임시 빌드**에서 'API 서버에 연결하지 못했습니다', 'API 연결 실패'를 확인했다. 프로젝트 .env·소스는 바꾸지 않았다.
- 지역41 선택 후 KPI 표시값과 sr-only 값이 각각 899,101 / 155,001 / 25,022 / 124로 일치했다. 모션은 화면 표시용, 툴팁·표·화면 읽기 값은 API 실제 값을 사용한다.
- 소스상 첫 등장 1회, 필터 tween, 막대 이후 KDE, 도넛·트리맵 호버, 박스플롯 전환, 지도 버블 선택 효과, 모션 감소 훅이 있다. 다만 FPS·CLS·모션 감소 설정 true·전체 애니메이션 콘솔을 계측한 기록은 없어 이 부분은 미확인이다. 정상 탐색 시 관찰한 React Router 향후 버전 경고와 의도적인 400/연결 실패를 애플리케이션 충돌로 세지 않았다.

## 8. Python PNG·분석 보고서·원본 보존

기존 10개와 v2 10개가 모두 디코딩됐고 dpi 최소 약 199.9996(PNG 반올림상 200dpi)이다. 이번에는 디코딩을 다시 실행하거나 PNG를 생성하지 않고, 디코딩 당시 해시와 현재 파일을 대조했다. 기존 한글·제목·범례·출처 검토 기록과 보존된 이미지를 사용했다. 임시 브라우저 스크린샷은 기존 PNG와 구분한다.

Python v2의 충전기 그래프는 기본 N 523,312기를 쓰지만, 웹 기본 필터는 대체로 all 527,433기이며 박스플롯은 all 선택 시 N을 사용하고 이를 화면에 설명한다. **같은 삭제 필터·같은 자료 모집단으로 맞춰야 수치를 비교할 수 있다.** 웹 기본 총수와 Python N 총수가 다르다는 이유로 수집 오류라고 판정하지 않았다. Python은 회귀식을 그대로 쓰므로 F1은 웹 표시 코드 문제다. 연도·전기차 기준 시점은 서로 다름을 유지한다.

현재 작업 전 해시 기준 **225개 파일에서 변경 0개**. 데이터·Excel·백엔드·프론트엔드·기존 보고서·기존/신규 PNG가 포함된다. node_modules·.venv·.git·바이트코드·도구 캐시 폴더는 보존 비교 대상에서 제외했다. 검증 빌드·pytest 로그·화면 캡처·상세 집계는 프로젝트 밖 작업 폴더에 두었다. 프로젝트에는 이 최종 MD만 신규 작성했다.

파일 목록:

- `outputs/charts/01_ev_registration_top10.png`
- `outputs/charts/02_ev_vehicle_type_donut.png`
- `outputs/charts/03_ev_commercial_stacked.png`
- `outputs/charts/04_chargers_by_region.png`
- `outputs/charts/05_station_location_scatter.png`
- `outputs/charts/06_charger_type_pie.png`
- `outputs/charts/07_charger_output_histogram.png`
- `outputs/charts/08_operator_chargers_top10.png`
- `outputs/charts/09_annual_charger_installation_trend.png`
- `outputs/charts/10_regional_output_heatmap.png`
- `outputs/charts_v2_report/v2_01_ev_top10.png`
- `outputs/charts_v2_report/v2_02_vehicle_donut.png`
- `outputs/charts_v2_report/v2_03_commercial_percent.png`
- `outputs/charts_v2_report/v2_04_stations_chargers_regression.png`
- `outputs/charts_v2_report/v2_05_station_size_boxplot.png`
- `outputs/charts_v2_report/v2_06_type_top4_donut.png`
- `outputs/charts_v2_report/v2_07_output_histogram_kde.png`
- `outputs/charts_v2_report/v2_08_regional_output_heatmap.png`
- `outputs/charts_v2_report/v2_09_cumulative_installation_area.png`
- `outputs/charts_v2_report/v2_10_operator_treemap.png`

## 9. 과제 요건과 15페이지 보고서 준비

| 사용자 전달 과제 요건 | 평가 |
|---|---|
| 웹 대시보드 | 충족: React 5개 페이지와 Flask API |
| 약 10개 주요 그래프 | 충족: 10개와 연간 설치·지도 등 추가 시각화 |
| 서로 다른 그래프 유형 | 충족: 기본 주요 표현 약 9종(도넛 중복 포함), 보기 전환·추가 그래프를 포함하면 더 다양함 |
| 그래프 관련 설명·분석 근거 | 자료 확보: 각 카드 및 기존 분석 MD. F2 문구는 수정 필요 |
| Python 라이브러리 명시 | 충족: Matplotlib·Seaborn, Pandas·NumPy 및 생성 코드·버전 파일 |
| 홈페이지 캡처 | 가능·증거 확보: desktop/mobile Overview 임시 캡처 있음 |
| 15페이지 내용 자료 | 확보 가능: 아래 구성안과 기존 데이터·보고서·PNG 활용 |
| 소스코드 포함 | 가능: collector/backend/frontend/scripts 및 명세. .env·캐시·venv·node_modules는 제외 |
| GitHub/Docker 보너스 | 아직 미완료. 현재 요청 범위상 업로드·제작하지 않음 |

15페이지 구성 예: 1 표지·요약, 2 목적·분석 질문, 3 출처·기준일·지역 체계, 4 수집·인증키 관리, 5 정제·품질 검증, 6 API·구조, 7 Overview, 8 EV 지역·차종, 9 사업용 구성, 10 유형·출력, 11 박스플롯, 12 지도·히트맵·산점도, 13 설치 추이, 14 검증·한계·보안, 15 결론·재현·참고문헌. 이는 실제 15페이지 편집본이나 교수의 공식 채점 승인이 아니라, 사용자 전달 기준에 맞춰 자료가 준비됐는지를 평가한 것이다.

Docker 적용 전에는 실행 경로·한글 폰트 이식성, API/정적 프론트엔드 분리, 읽기 전용 데이터 경로, CORS, 컨테이너 내부 바인딩, 의존성 패치·고정 및 .dockerignore의 인증정보·캐시 제외, SPA 직접 경로 처리, 초기 로딩/워커 메모리를 정해야 한다. 별도 Linux/Docker 실행 검증은 미확인 상태로 남긴다.

## 10. 실패·미확인 체크 ID

| 체크 ID | 상태 | 항목 |
|---|---|---|
| `chart_math-005` | FAIL | scatter actual OLS segment |
| `security-git` | UNVERIFIED | Git tracked secrets/history |
| `security-014` | FAIL | large CSV excluded from prospective Git |
| `ui-growth-filter-narrative` | FAIL | ui-growth-filter-narrative |
| `ui-heatmap-tooltip-clipping` | FAIL | ui-heatmap-tooltip-clipping |
| `responsive-390-EV Registration` | FAIL | responsive-390-EV Registration |
| `responsive-390-Charging Infrastructure` | FAIL | responsive-390-Charging Infrastructure |
| `ui-mobile-box-detail` | FAIL | ui-mobile-box-detail |
| `security-npm` | FAIL | Unresolved npm advisory packages |
| `build-font-warnings` | FAIL | Unresolved font asset warnings |
| `build-bundle-warning` | FAIL | JavaScript bundle size warning |
| `structure-portability` | FAIL | Python plotting cross-platform paths |
| `unverified-motion-runtime` | UNVERIFIED | prefers-reduced-motion actual runtime |
| `unverified-motion-performance` | UNVERIFIED | Animation FPS / CLS / full console trace |
| `unverified-touch-device` | UNVERIFIED | Physical mobile touch / hover alternatives |
| `unverified-tooltips-exhaustive` | UNVERIFIED | Every graph tooltip at every filter combination |
| `unverified-fresh-platform` | UNVERIFIED | Fresh Linux / Docker reproduction |
| `unverified-production-load` | UNVERIFIED | Production multi-user load and latency |
| `unverified-browser-remaining-interactions` | UNVERIFIED | Remaining detailed UI interactions |

상세 증거 원본은 `<이전 작업 폴더>\work\final_validation_20261017`의 `data_api_audit.json`, `browser_audit.json`, `pytest.xml`, `png_audit.json`, `frontend_math.json`, `npm_audit.json`, `final_validation_ledger.json`이다. 이는 새 보고서의 근거 기록이며 제출용 프로젝트 소스와 혼합하지 않았다. JSON 전체에는 체크 ID·분야·상태·수치 증거가 포함된다.

**제출 판단:** F1~F5 수정 및 좁은 범위 재검증 후 제출 권장. 공개 배포 시 S1~S2도 선행해야 한다. 선택적 폰트·번들·이식성 개선과 미확인 시험은 그 목적에 맞게 계획한다. 이번 작업에서는 지적만 했으며 오류 수정은 수행하지 않았다.

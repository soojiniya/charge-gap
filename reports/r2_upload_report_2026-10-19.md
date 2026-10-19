# CHARGE GAP R2 비공개 데이터 업로드 결과

작업일: 2026-10-19 (한국 시간). 결과: **SUCCESS — 대상 14개 업로드 및 SHA-256 검증 통과**.

사용자가 로컬 인증정보 저장과 비공개 14개 파일 업로드를 명시적으로 승인한 후 실행했다.

## 결과 요약

- 버킷: `charge-gap-data`, 객체 prefix 없음. 프로젝트 상대 경로와 동일하다.
- 신규 업로드: **14개**. 기존 일치 객체 재사용: **0개**. 충돌: 0개.
- 원격 검증: **14/14개 통과**.
- 총 업로드/검증 데이터: **242,521,708바이트 = 231.287MiB**.
- 모든 PUT에 `StorageClass=STANDARD`, `IfNoneMatch=*`를 지정했다. 기존 객체 덮어쓰기·삭제 명령은 실행하지 않았다.
- S3 API 호출: HeadBucket 1회, HeadObject 14회, PutObject 14회, GetObject 14회 = **43회**. 재시도 없음.
- Class A 14회 / Class B 29회. 검증 다운로드 데이터는 총 업로드 데이터와 같은 크기다. 헤더/TLS 오버헤드는 제외했다.

## 객체별 검증

| 버킷 내부 객체 경로 | 원격 검증 바이트 | 원격 내용 SHA-256 | 로컬 manifest 비교 |
|---|---:|---|---|
| `data/processed/charger_info_clean.csv` | 240,535,251 | `6cf8e89777a7720fdbb9f6800e555424896d870c4f45a6c5bde2f8012c5d00dd` | 일치 |
| `data/processed/ev_registration_by_region_2025.csv` | 3,158 | `2be3140319d5cc20766e598cba8f356c577b986d4ce4d3134c9f4dad8bfef075` | 일치 |
| `data/processed/charger_installation_trend.csv` | 2,353 | `7bf139ea609e6b4b7084e0a1aac65ed687f10b9094e4aee6b00697c8edd8e976` | 일치 |
| `reports/chart_verification.json` | 48,038 | `f077acf5e2ac72db5fba7edd1a4d05c815dbb57f57d8f9ce4baa506a896ba50a` | 일치 |
| `outputs/charts/01_ev_registration_top10.png` | 108,203 | `0e96ad7970496e425ed9a8488e719de3fdc77f370ced2042bbbdb8f825cde787` | 일치 |
| `outputs/charts/02_ev_vehicle_type_donut.png` | 132,110 | `cfafa37c02d0743e8337f7c64922e7dc81eb443b1f1e2dee4cf551866cfea4a9` | 일치 |
| `outputs/charts/03_ev_commercial_stacked.png` | 97,846 | `efd05bf2b5896aa24d2e18034071a9d3903480a72c6f8517569bfa5f829316c3` | 일치 |
| `outputs/charts/04_chargers_by_region.png` | 143,670 | `d7b6121823427748218e42b23fedea289d48b2f54456e01ed21b7d8ffadf3144` | 일치 |
| `outputs/charts/05_station_location_scatter.png` | 419,475 | `e0314e3bafcacc294fdbe15f07298d6b2080276ddda90b15d2a39719cdf6e151` | 일치 |
| `outputs/charts/06_charger_type_pie.png` | 186,761 | `1915096a40fb0f3447f08d3494760449136c5eb7b1fada646d93eebf49a18f6f` | 일치 |
| `outputs/charts/07_charger_output_histogram.png` | 102,631 | `7da76317a77cff919d8922e35fb6316c8db6e63ef60a0c64f4fdc05f5bb2c2b7` | 일치 |
| `outputs/charts/08_operator_chargers_top10.png` | 146,636 | `637a4fdaaa344f1cebd5687020afffa1b82ce6b9a06a443d9f3e24a1f573d319` | 일치 |
| `outputs/charts/09_annual_charger_installation_trend.png` | 161,346 | `687dd3cb95079dfba3e622783f9c19b8c46843eebcb3cfe79111a90b9a86507e` | 일치 |
| `outputs/charts/10_regional_output_heatmap.png` | 434,230 | `a6d622b0d61516e42c3954fb48d5f98b4dbd6718b6b296ac020ce013ccd3d424` | 일치 |

## 검증 방법 및 보존

기존 `deploy/render/data-manifest.json`의 14개 파일을 업로드 전에 전부 로컬 해시로 검증했다. 인증된 HeadBucket으로 접근 권한을 확인하고 모든 대상 경로를 HEAD로 먼저 점검했다. 14개 모두 누락이어서 충돌 없이 조건부 PUT을 수행했다.

업로드 응답의 ETag는 GET의 If-Match에 사용하는 버전/동일 표현 식별자로만 사용했다. 각 GET 본문을 1MiB 단위로 읽어 실제 SHA-256과 총 바이트를 계산했으며 **ETag 또는 객체 사용자 메타데이터를 SHA-256 검증의 대용으로 사용하지 않았다**. 원격 검증에 별도 공개 URL이나 공개 버킷은 사용하지 않았다.

업로드 후 로컬 14개 파일을 다시 검증해 원본이 동일함을 확인했다. 기존 역사 manifest 234개 중 README와 data.py의 차이는 앞선 배포 준비/메모리 최적화 단계에서 발생한 기존 변경이며, 나머지 232개(원본·CSV·PNG·기존 보고서 등)는 동일했다. 이번 작업에서 앱 소스·React·Docker Compose·원본 파일을 변경하지 않았다.

## 비공개 상태와 인증정보

Public Access Disabled는 작업 전 사용자가 확인한 상태다. 이번 도구는 HeadBucket/HeadObject/PutObject/GetObject만 호출했다. 공개 접근·버킷 설정·ACL·custom domain·r2.dev 설정을 변경하거나 버킷/객체를 삭제하는 호출은 없었다.

**관리 API로 Public Access 설정을 독립 조회한 것은 아니다.** 최소 객체 읽기/쓰기 토큰은 관리 설정 검증용으로 권한을 확대하지 않았다. 대시보드의 Disabled 상태를 최종 확인할 수 있으며, 보고서는 이를 관리 API 검증 완료로 표현하지 않는다.

실제 endpoint·Account ID·Access Key ID·Secret Access Key는 보고서나 결과 JSON에 포함하지 않았다. 자격증명 파일은 로컬 Git 제외 work/r2-upload에만 두고 Windows ACL 상속을 차단해 현재 사용자 1개의 명시적 접근 규칙을 확인했다. 키를 명령행 인수에 전달하지 않았다. 전용 SDK/도구·체크포인트 역시 Git 제외 폴더에만 있다.

업로드용 토큰은 작업 완료 후 사용자 대시보드에서 폐기하고, Render에는 이 버킷의 **Object Read only** 전용 토큰을 새로 발급하는 것을 권장한다. 이번 작업에서는 토큰 관리 권한을 요청하거나 토큰을 폐기하지 않았다.

## 비용

계정 전체 사용량이 무료 범위 안이면 이번 작업의 **추가 비용은 $0 예상**이다. R2 Standard 무료 범위는 10GB-month, 월 Class A 100만 회/Class B 1,000만 회이며 직접 egress는 무료다. 실제 계정의 남은 무료 할당이나 청구서를 관리 API로 조회하지 않았으므로 $0 청구를 확정하지 않는다.

$1 예산 알림은 통지이며 사용량/청구를 차단하는 상한이 아니다.

- [R2 공식 가격](https://developers.cloudflare.com/r2/pricing/)
- [예산 알림 동작](https://developers.cloudflare.com/billing/manage/budget-alerts/)
- [조건부 PUT 지원](https://developers.cloudflare.com/r2/api/s3/api/)

## 향후 Render 설정과 남은 일

필요한 환경변수 이름:

```text
PORT                              Render 자동 제공
CHARGE_GAP_CORS_ORIGINS            실제 프론트엔드 HTTPS origin
CHARGE_GAP_S3_ENDPOINT             비공개 S3 endpoint (실제 값은 Render 환경 설정에만)
CHARGE_GAP_S3_BUCKET               charge-gap-data
CHARGE_GAP_S3_PREFIX               비우거나 생략: 객체가 버킷 루트에 있음
CHARGE_GAP_S3_REGION               auto
CHARGE_GAP_S3_ACCESS_KEY_ID        새 읽기 전용 키
CHARGE_GAP_S3_SECRET_ACCESS_KEY    새 읽기 전용 비밀키
VITE_API_BASE_URL                 프론트엔드 빌드용 실제 백엔드 HTTPS origin
```

저장소 인증정보는 VITE_*에 넣지 않는다. 기존 가짜 오프라인 테스트값 대신 실제 읽기 전용 설정으로 새 Render 이미지의 다운로드·기동·512MiB/0.1 CPU를 검증해야 한다. 현재 전송은 SDK를 사용했으므로 배포 진입점의 별도 S3 서명/다운로드 실인증 검증까지 완료됐다는 뜻은 아니다.

EV 등록 Excel·설치 추이 Excel 및 파생 자료의 원문/공개 이용 조건은 여전히 미확정이다. 이번 승인은 **비공개 저장소 전송**이며 공개 웹 배포 허락을 의미하지 않는다. 한국환경공단 API는 출처표시 제1유형 안내를 확인한 이력이 있으나 다른 입력 자료까지 일괄 허용된 것으로 해석하지 않는다.

이용 조건 확인, 읽기 전용 토큰 발급 및 새 이미지의 실제 다운로드 검증 후 별도 승인에 따라 Git commit/push와 Render 생성·HTTPS/CORS/SPA/지도 확인을 진행할 수 있다. 이번에는 Git commit/push, Render 생성/공개 배포를 하지 않았다.

상세 체크포인트는 프로젝트 내부 Git 제외 경로 `work/r2-upload/result_20261019T015308179050Z/result.json`에 저장했다. 비밀정보는 포함하지 않는다.

# R2 읽기 전용 다운로드 및 배포 기동 검증

작성일: 2026-10-19 (KST). 생성 시각: 2026-10-19T02:07:42.783743+00:00.

## 최종 판정: CONDITIONAL PASS

새 인증정보를 사용한 실제 R2 GET, 14개 파일 크기·SHA-256, 다운로드 데이터의 Flask 초기화 및 원본 대비 API 응답 동일성은 PASS이다. 이 실행 환경은 Docker Desktop Linux 엔진 named pipe 접근이 거부되어, **실제 R2 다운로드를 포함한 Linux 512MiB·0.1 CPU 기동 시험은 미확인**이다. 과거 Linux 메모리 시험 성공이나 Windows 검증을 이번 Docker 시험 성공으로 대신 기록하지 않는다. Render 서비스는 생성하지 않았다.

## 실행 결과

| 항목 | 실제 결과 |
| --- | --- |
| 새 인증정보 필수 설정 검증 | PASS, 실제 값 비공개 |
| 버킷 객체 읽기 | PASS, manifest의 14개 경로에서 실제 GET 성공 |
| 권한의 읽기 전용 범위·만료 | 사용자 제공 설정; 쓰기 또는 삭제 요청으로 권한을 시험하지 않음 |
| 다운로드 파일 | 14/14 |
| 실제 GET 시도 | 14회, 추가 재시도 없음 |
| 총 크기 | 242,521,708 bytes / 231.286724 MiB |
| 다운로드 + 스트리밍 크기/SHA 검증 | 9.125초, Windows 호스트 측정 |
| 별도 임시 디렉터리 | `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-readonly-startup\local_20261019T020424Z\downloaded` |
| 원본과 비교한 API 응답 | 32/32 동일, 각각 32회 조회 모두 HTTP 200 |
| 비교 방법 | 별도 프로세스에서 같은 Flask 코드에 원본/다운로드 디렉터리를 지정, JSON 키 정렬 후 SHA-256 비교 |
| 다운로드 데이터 Flask 초기화 | 3.781초, Windows Flask test client |
| 다운로드 데이터 API 최대 처리시간 | 0.297초, Windows Flask test client; 네트워크 지연 제외 |
| Docker 기동/다운로드/준비 시간 | 미측정: `DockerLinuxEngineUnavailable` |
| Docker 최대 메모리·남은 여유 | 미측정 |
| Docker CPU·OOM·재시작 | 미측정; OOM=false를 확인한 것으로 기록하지 않음 |
| 원본 14개 크기·SHA-256 | 실행 전후 모두 manifest 일치 |

기동 시간은 서로 구분한다. 위 9초대 다운로드 시간과 Windows 초기화 시간을 합쳐 Render 기동 시간을 예측하지 않는다. 과거 512MiB Linux API 성공 시험은 사전 다운로드/마운트 데이터에 대한 별도 증거이다.

## API 정확성

| 기준 | 다운로드 파일로 계산한 값 |
| --- | ---: |
| 전체 충전기 | 527,433기 |
| 고유 충전소 | 101,091곳 |
| 비삭제 표시 충전기 | 523,312기 |
| 삭제 표시 충전기 | 4,121기 |
| 전기차 등록 | 899,101대 |

비교 요청에는 전체 주요 API 10개, 전국 지도·bbox, 16개 지역 출력 조회, 운영기관 조회, 복합 필터, 반복 조회가 포함된다. 복합 필터 `region_code=36&charger_type=04&deletion=not_deleted&operator_id=ME`의 일치 표본은 충전기 70기·충전소 37곳으로 확인했다. 이번 Windows 비교는 순차 실행이며 동시성 검증은 아래 Docker 시험에 포함했다.

충전기 API 기준일은 2026-10-15, 전기차 등록은 2025-12이다. 비삭제 표시는 이용 가능 상태와 같지 않다. 서로 다른 시점의 부족률은 계산하지 않았다.

## 파일별 검증

SHA-256은 R2에서 실제 수신한 본문과 manifest를 비교했다. ETag를 SHA-256으로 해석하지 않았다. 객체 경로는 로컬 프로젝트 상대 경로와 같다.

| 객체 경로 | Bytes | SHA-256 | 결과 |
| --- | ---: | --- | --- |
| `data/processed/charger_info_clean.csv` | 240,535,251 | `6cf8e89777a7720fdbb9f6800e555424896d870c4f45a6c5bde2f8012c5d00dd` | PASS |
| `data/processed/ev_registration_by_region_2025.csv` | 3,158 | `2be3140319d5cc20766e598cba8f356c577b986d4ce4d3134c9f4dad8bfef075` | PASS |
| `data/processed/charger_installation_trend.csv` | 2,353 | `7bf139ea609e6b4b7084e0a1aac65ed687f10b9094e4aee6b00697c8edd8e976` | PASS |
| `reports/chart_verification.json` | 48,038 | `f077acf5e2ac72db5fba7edd1a4d05c815dbb57f57d8f9ce4baa506a896ba50a` | PASS |
| `outputs/charts/01_ev_registration_top10.png` | 108,203 | `0e96ad7970496e425ed9a8488e719de3fdc77f370ced2042bbbdb8f825cde787` | PASS |
| `outputs/charts/02_ev_vehicle_type_donut.png` | 132,110 | `cfafa37c02d0743e8337f7c64922e7dc81eb443b1f1e2dee4cf551866cfea4a9` | PASS |
| `outputs/charts/03_ev_commercial_stacked.png` | 97,846 | `efd05bf2b5896aa24d2e18034071a9d3903480a72c6f8517569bfa5f829316c3` | PASS |
| `outputs/charts/04_chargers_by_region.png` | 143,670 | `d7b6121823427748218e42b23fedea289d48b2f54456e01ed21b7d8ffadf3144` | PASS |
| `outputs/charts/05_station_location_scatter.png` | 419,475 | `e0314e3bafcacc294fdbe15f07298d6b2080276ddda90b15d2a39719cdf6e151` | PASS |
| `outputs/charts/06_charger_type_pie.png` | 186,761 | `1915096a40fb0f3447f08d3494760449136c5eb7b1fada646d93eebf49a18f6f` | PASS |
| `outputs/charts/07_charger_output_histogram.png` | 102,631 | `7da76317a77cff919d8922e35fb6316c8db6e63ef60a0c64f4fdc05f5bb2c2b7` | PASS |
| `outputs/charts/08_operator_chargers_top10.png` | 146,636 | `637a4fdaaa344f1cebd5687020afffa1b82ce6b9a06a443d9f3e24a1f573d319` | PASS |
| `outputs/charts/09_annual_charger_installation_trend.png` | 161,346 | `687dd3cb95079dfba3e622783f9c19b8c46843eebcb3cfe79111a90b9a86507e` | PASS |
| `outputs/charts/10_regional_output_heatmap.png` | 434,230 | `a6d622b0d61516e42c3954fb48d5f98b4dbd6718b6b296ac020ce013ccd3d424` | PASS |

## Docker 시험 실행 방법

일반 PowerShell에서 Docker Desktop이 Linux 컨테이너 모드로 실행된 상태로 다음 명령을 실행한다.

```powershell
Set-Location -LiteralPath 'C:\Users\User\Documents\Codex\CHARGE GAP'
& '.\backend\.venv\Scripts\python.exe' -B '.\work\r2-readonly-startup\run_docker.py' --build --repeats 3
```

시험 내용:

- 배포 Dockerfile `deploy/render/Dockerfile`로 별도 태그 `charge-gap-render:r2-readonly-test`를 빌드한다. 인증정보·CSV·PNG를 이미지에 넣지 않는다.
- 기존 CMD `/app/deploy/render/start.py`를 그대로 실행한다. 데이터 마운트 없이 깨끗한 컨테이너가 R2에서 14개 파일을 다운로드한다.
- 512MiB 메모리와 동일한 memory-swap 한도로 추가 swap을 허용하지 않고 CPU를 0.1로 제한한다. Waitress 1스레드와 수치 라이브러리 1스레드는 기존 배포 설정을 사용한다.
- 인증정보는 로컬 자식 프로세스 환경에서 Docker에 전달하며 CLI 인수에 값을 넣지 않는다. Docker 관리자에게 컨테이너 환경은 보일 수 있으므로 일반적인 로컬 관리자 보안 경계를 전제로 한다. 전체 docker inspect/환경 덤프를 보고서나 채팅에 공유하지 않는다.
- 준비 완료 후 14개 파일을 컨테이너 안에서 다시 검증한다. 지도·복합 필터를 포함해 32개 요청을 3회, 총 96회 실행한다. 병렬 구간은 클라이언트 4개로 실행한다.
- docker stats 샘플, cgroup v2 memory.peak/current/events, cpu.stat, OOMKilled, 종료 코드, 재시작 횟수, 평균·최대 응답시간을 `work/r2-readonly-startup/docker_<시각>/result.json`에 기록한다.
- Data ready 로그 시각으로 다운로드·검증 단계 종료를 측정한다. 이는 Docker start부터의 단계 시간이며 순수 전송 시간은 아니다. /api/charts의 실제 HTTP 성공으로 준비 완료를 판정한다.
- memory.peak는 다운로드부터 API 시험과 추가 SHA 검증 프로세스까지 포함한다. 자원 조회를 위한 작은 docker exec 프로세스 비용도 포함한다. CPU 평균은 docker stats의 관측 평균이다.
- 임의의 호스트 loopback 포트를 사용하므로 18080/5000/5173과 충돌하지 않는다. 정상 종료 전 상태를 기록하고 고유 이름의 시험 컨테이너만 제거한다. 실행 중 기록된 ExitCode=0은 정상 프로세스 종료 증거와 구분한다.
- 작업이 도중에 중단되면 남은 `charge-gap-r2-test-*` 시험 컨테이너를 확인한 뒤 해당 컨테이너만 정리한다. 기존 컨테이너나 볼륨을 삭제하는 명령은 사용하지 않는다.

최종 PASS에는 실제 14개 다운로드 성공 로그, 컨테이너 내 14개 SHA 일치, 96/96 요청 성공, OOMKilled=false, oom_kill=0, 재시작 0회, 최고 메모리 512MiB 미만을 요구한다. 시험이 실패하면 JSON의 최초 실패 단계·기동 상태·자원 수치를 분석한 뒤 진행한다. `--build`를 빼고 같은 검증 이미지를 재사용할 수 있지만, 소스가 바뀌면 다시 빌드해야 한다.

## 보안·보존

- R2에는 GET만 사용했다. 업로드, 삭제, 객체 수정, 공개 접근 설정 요청을 하지 않았다. 토큰의 읽기 전용 범위 및 버킷 Public Access Disabled는 사용자 설정에 근거하며 객체 토큰으로 관리 영역 전체를 검증한 것은 아니다.
- 인증정보 파일과 전체 시험 폴더는 `work/` 아래에 있고 git check-ignore로 제외됨을 확인했다. 비밀값이나 계정별 endpoint를 보고서에 기록하지 않았다.
- 새 파일은 시험 도구·임시 다운로드·결과 JSON과 이 보고서뿐이다. 기존 백엔드·프론트엔드·Compose·CSV·PNG·JSON 및 기존 보고서를 수정하지 않았다. 원본 14개의 바이트 동일성은 manifest로 재검증했다.
- Git 상태에 보이는 README·메모리 최적화·배포 준비 변경은 선행 작업에서 존재하던 상태이다. 이번 작업에서 commit/push, 서비스 생성, 공개 배포를 하지 않았다.

## Render 배포 전 남은 작업

1. 위 Docker 시험 결과를 받아 실제 다운로드·메모리 제한·API 준비 완료까지 최종 확인한다. 현재의 R2 PASS와 Docker 미확인을 분리한다.
2. 데이터 출처별 이용 조건과 공개 웹 서비스에서의 표시·재배포 허용 범위를 확정한다. 비공개 R2 저장은 공개 서비스 이용 허가를 대신하지 않는다. 미확정 Excel 원천 통계 이용 조건은 여전히 확인 필요다.
3. 사용자 승인 후 코드 commit/push, Render Free Docker Web Service와 프론트엔드 Static Site를 준비한다. 현재는 생성하지 않는다.
4. 서버 비밀 환경변수 `CHARGE_GAP_S3_ENDPOINT`, `CHARGE_GAP_S3_BUCKET`, `CHARGE_GAP_S3_ACCESS_KEY_ID`, `CHARGE_GAP_S3_SECRET_ACCESS_KEY`, `CHARGE_GAP_S3_REGION=auto`를 설정하고 `CHARGE_GAP_S3_PREFIX`는 비워 둔다. 세션 토큰은 발급한 경우에만 설정한다. 프론트엔드에는 전달하지 않는다.
5. Render 제공 PORT를 사용하고, `CHARGE_GAP_CORS_ORIGINS`에 실제 프론트엔드 HTTPS origin, 프론트엔드 `VITE_API_BASE_URL`에 실제 백엔드 주소를 지정한다. 기존 문서의 환경변수 이름과 프론트엔드 설정을 실제 서비스 생성 시 다시 대조한다. SPA rewrite, API 오류 안내, 지도 타일, 실제 모바일 접속을 공개 URL에서 확인한다.
6. 읽기 전용 토큰의 6개월 만료 전에 교체·재기동 검증을 예약하고 사용량을 관찰한다. 현재 토큰 값을 로그나 프론트엔드에 넣지 않는다.

Render Free는 15분 유휴 후 중지되며 재시작·재배포·유휴 종료 시 로컬 파일이 사라진다. 따라서 콜드 부팅마다 약 231.29MiB를 재다운로드할 수 있다. 외부 저장소에 대한 비정상적으로 큰 서비스 발신 트래픽은 무료 서비스 제한 사유가 될 수 있으므로 실제 재시작 빈도를 점검해야 한다. [Render 공식 무료 서비스 제한](https://render.com/docs/free).

이번 호스트 검증은 GET 14회, 242,521,708 bytes 읽기이며 R2 저장량은 늘지 않았다. Docker 시험 1회는 보통 추가 GET 14회와 같은 양의 전송을 요구한다. 계정 전체가 Standard 무료 한도 안에 있다면 이 규모의 추가 R2 비용은 $0으로 예상되지만 계정 전체 사용량은 검증하지 않았다. R2는 Standard 월 10GB-month, Class B 1천만 회 무료 한도와 인터넷 egress 무료를 안내한다. $1 비용 알림은 지출 상한이 아니다. [Cloudflare 공식 R2 요금](https://developers.cloudflare.com/r2/pricing/).

## 증거 파일

- 실제 다운로드: `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-readonly-startup\local_20261019T020424Z\result.json`
- 원본 API 비교: `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-readonly-startup\local_20261019T020424Z\original_api.json`
- 다운로드 API 비교: `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-readonly-startup\local_20261019T020424Z\downloaded_api.json`
- 비교 요약: `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-readonly-startup\local_20261019T020424Z\api_comparison.json`
- Docker 접근 제한 기록: `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-readonly-startup\docker_20261019T020522Z\result.json`
- 시험 도구: `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-readonly-startup\run_docker.py`

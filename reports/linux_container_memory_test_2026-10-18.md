# CHARGE GAP Linux 컨테이너 메모리 제한 시험 — 실측 대기

검증일: 2026-10-18 (한국 시간)

## 결론

**CONDITIONAL PASS 유지 — Linux 512MiB 적합성은 미확인.**

이번 실행 환경에서 Docker Desktop Linux 엔진 named pipe 접근이 거부되어 컨테이너 실측을 시작하지 못했다. 이는 메모리 시험 실패나 OOM을 의미하지 않는다. 이전 Windows 464MiB 결과로 Linux 512MiB 통과를 대신 판정하지 않는다. 아래에 준비한 독립 시험을 Docker 엔진에 접근 가능한 일반 PowerShell에서 수행해야 최종 판정을 내릴 수 있다.

## 실제 수행 결과

| 항목 | 결과 |
|---|---|
| Docker CLI 설치 | 확인: 사용자 DockerDesktop resources/bin/docker.exe |
| Docker context | desktop-linux |
| Docker Desktop 실행 상태 | 미확인: desktop status 조회 실패 |
| Linux Docker 엔진 연결 | 실패: dockerDesktopLinuxEngine named pipe permission denied |
| Docker Desktop CLI 시작 시도 | 실패: Docker Inc.\\Docker Desktop 레지스트리 키를 찾지 못함 |
| 시험 컨테이너 기동 | 미실행 |
| 초기 CSV 로딩 | 미측정 |
| API 요청 성공률 | 미측정: 부하 요청 0건 실행, 계획 시나리오당 32건 |
| 최대 메모리 / CPU 사용량 | 미측정 |
| OOM / 재시작 | 미확인: 시험 컨테이너가 생성되지 않음 |
| 평균 / 최대 응답시간 | 미측정 |
| 0.1 CPU 제한 시험 | 미실행 |
| 별도 시험 스크립트 | Python 구문 검사 통과, Docker 사전 점검에서 차단 확인 |
| 보호 파일 보존 | 233개 SHA-256 비교, 변경 0개 |
| Git 상태 (본 보고서 작성 전) | main...origin/main, 변경 없음 |

Docker Desktop이 실제로 중지됐다고 단정할 수 없다. 샌드박스의 Windows 프로세스·레지스트리·엔진 접근 제한과 사용자의 일반 터미널 상태는 다를 수 있다. 보안 경계를 우회하거나 Docker API를 외부로 노출하는 조치는 수행하지 않았다.

## 준비된 독립 시험

시험 스크립트와 실행 안내는 프로젝트 소스 밖의 다음 디렉터리에 새로 생성했다.

`<이전 작업 폴더>\work\linux_memory_test`

- `run_linux_memory_test.py`: 호스트 측 실행·부하·Docker stats·상태·해시 기록.
- `container_probe.py`: 시작 전부터 cgroup/프로세스 메모리 및 CPU 측정, 기존 create_app와 Waitress 실행.
- `TEST_GUIDE.md`: 실행 방법, 요청 구성, 측정 방법과 한계.
- `results_20261018_181019_b11ee1/summary.json`: 이번 사전 점검의 접근 거부 및 233개 파일 보존 증거.

### 실행 명령

Docker Desktop을 실행한 뒤 일반 PowerShell에서:

```powershell
& "<프로젝트 폴더>\backend\.venv\Scripts\python.exe" -B "<이전 작업 폴더>\work\linux_memory_test\run_linux_memory_test.py"
```

기존 backend 이미지가 `charge-gap-backend:latest`가 아니라면 실제 로컬 이름을 확인해 `--image 이름:태그`를 추가한다. 이미지가 없으면 자동 pull/build하지 않고 중단한다.

### 시험 조건

| 조건 | A | B |
|---|---|---|
| RAM | 512MiB (536,870,912바이트) | 동일 |
| 추가 swap | 금지 (`memory-swap=memory`) | 동일 |
| CPU | 별도 제한 없음 | 0.1 CPU |
| Waitress 요청 스레드 | 1 | 1 |
| 수치 연산 라이브러리 스레드 | BLAS/OpenMP/MKL/NumExpr 등 1 | 동일 |
| 재시작 정책 | no | no |
| 준비 대기 / 요청 timeout | 600초 / 180초 | 동일 |

기존 Compose는 사용하거나 수정하지 않는다. UUID 기반 별도 시험 컨테이너에 임의 loopback 포트를 할당한다. CSV 3개, chart_verification.json, 기존 charts 폴더만 원래 /app 경로로 읽기 전용 마운트하며 .env나 인증키를 전달하지 않는다. 프로세스 내부 계측 스레드 1개의 비용도 제한에 포함된다. 프론트엔드 및 Nginx 메모리는 이번 Flask 단독 시험 범위 밖이다.

### 부하 32건 (시나리오별)

- 순차 9건: overview, 지역, 유형, 출력, 운영기관, 박스플롯, 전국 지도, bbox 지도, 복합 필터.
- 순차 3건: 전기차 등록, 설치 추이, 차트 메타데이터.
- 지역별 출력 16건: 클라이언트 동시성 4.
- overview·지역·박스플롯·지도 혼합 4건: 동시성 4.

별도 준비 폴링 /api/charts는 32건 부하와 구분한다. 1개 Waitress 스레드에서 동시 요청은 대기할 수 있으며 응답시간에 대기시간도 포함된다.

기준 합계 527,433기 / 101,091곳 / 삭제 4,121기 / 비삭제 523,312기 / EV 899,101대를 확인한다. 복합 필터 `region_code=36&charger_type=04&deletion=not_deleted&operator_id=ME`는 기존 검증의 70기 / 37곳과 대조한다. 응답 JSON의 data/meta 구조를 확인한다.

## 측정치 판독

- Docker stats: 샘플별 메모리·CPU; 평균/최대 CPU는 해당 관측 구간 값이다.
- cgroup v2: memory.current, memory.peak, memory.max, memory.swap.max, memory.events, cpu.stat. v1은 memory usage/maximum/limit/failcnt로 대체한다.
- 프로세스: VmRSS/VmHWM. 이 값은 컨테이너 전체 사용량과 구분한다.
- Docker inspect: 실효 메모리/CPU 제한, OOMKilled, ExitCode, Running, RestartCount를 시험 컨테이너 삭제 전에 저장한다.
- 컨테이너 내 250ms 샘플과 kernel memory.peak로 초기 import·CSV 로딩의 일시 최고값도 관찰한다. OOM 직전 마지막 샘플 이후 이벤트는 누락될 수 있으므로 Docker 종료 상태도 필수 확인한다.
- Docker stats는 Linux 비활성 파일 캐시 등을 차감해 표시할 수 있다. cgroup 최고값과 동일 수치로 취급하지 않는다.
- 시나리오별 응답시간 평균/최대와 개별 요청 결과를 기록한다. 실패/timeout의 경과 시간도 별도 요청 기록에 남긴다.
- 0.1 CPU의 throttled_usec/CPU 대기 및 timeout은 OOM과 구별한다. 호스트 Docker의 0.1 CPU 제한은 Render의 네트워크·공유 호스트·슬립 정책까지 재현하지 않는다.

32/32 성공, 기동·데이터 검증 성공, OOM 없음, 재시작 0, 정확한 실효 제한 및 메모리 여유가 확인돼야 단기 시험을 통과로 볼 수 있다. 한도 근접값이나 단일 단기 성공만으로 장기 안정성을 보증하지 않는다.

## 메모리 위험 지점과 향후 개선 후보

다음은 기존 코드/Windows 측정에 근거한 **검토 후보**이며 이번 Linux 병목으로 실측 확정한 내용은 아니다. 구현 변경은 하지 않았다.

- `backend/chargegap_api/data.py`의 DataStore는 CSV 문자열 열 15개와 수치 변환 열을 상주시키고 시작 시 정리·중복·합계를 검증한다. 로딩 피크가 문제라면 제한된 범주형 열 dtype, 필요한 문자열의 보관 방식, 분할 로딩을 검토한다. 문자열 ID와 빈 문자열 의미는 유지해야 한다.
- `select()`는 필터 결과 DataFrame을 복사하고 grouped()/locations()는 추가 중간 프레임을 만든다. 필터 의미를 유지한 좁은 열 선택, 불필요한 복사 축소, 제한된 캐시를 검토할 수 있다. 무제한 조합 캐시는 오히려 메모리를 늘린다.
- `locations()`는 전국 대표 좌표와 충전소별 합계를 만든 뒤 bbox/페이지네이션을 적용한다. limit을 낮추는 것만으로 앞단 집계 피크가 없어지지 않는다. 대표 좌표 선정 규칙과 충전기 필터 순서를 유지하는 별도 인덱스/DB 집계를 검토한다. 원본 행에 bbox를 먼저 적용하는 방식으로 의미를 변경해서는 안 된다.
- 1스레드는 동시 처리 피크를 낮추지만 0.1 CPU에서는 요청 대기가 늘어난다. 결과 재사용/사전 집계 또는 메모리 여유가 있는 호스팅을 검토하되 이번에는 변경·가입·배포하지 않는다.
- 프론트엔드까지 한 컨테이너에 합치면 추가 프로세스 메모리를 포함해 별도 시험해야 한다. 현재 시험 계획은 Flask 단독이며 React 정적 호스팅 분리 후보와 일치한다.

## 보존 및 다음 단계

CSV·Excel·PNG·기존 보고서·추적 소스 및 Docker 설정 233개는 사전 점검 전후 해시가 같았다. 이 새 보고서와 프로젝트 외부 시험 도구만 작성했다. 기존 compose.yaml의 포트 18080 및 UI는 유지했다. 데이터 재수집, 이미지 빌드, 실제 클라우드 배포, GitHub push, 인증정보 출력, 유료 가입은 하지 않았다.

일반 PowerShell 실행 후 생성된 `results_.../summary.json` 및 두 시나리오 JSON을 확인해 실측 결과를 보완해야 한다. 현재의 미측정 항목을 통과로 계산하지 않는다.

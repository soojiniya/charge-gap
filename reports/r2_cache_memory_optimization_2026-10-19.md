# R2 다운로드 포함 메모리 분석 및 캐시 최적화

작성일: 2026-10-19. **Linux 512MiB·0.1 CPU 메모리/기능 검증: PASS. 실제 Render 공개 배포 준비 판정: CONDITIONAL PASS** (데이터 이용 조건 및 공개 URL 실검증 필요).

실제 R2 다운로드와 API 기능은 기존 Linux 시험에서 성공했다. 실패는 OOM이나 API 오류가 아니라, 원시 cgroup 최고 메모리가 한도에 닿아 메모리 여유 기준을 충족하지 못했기 때문이다. 캐시 반환 최적화를 적용했고 로컬 테스트 118개 및 API 동일성 검증을 통과했다. Codex 환경의 Docker 엔진 접근 거부 후 사용자 PC에서 실행된 실제 시험 결과 파일을 확인했다. **최적화 후 최고 메모리 426.184MiB, 여유 85.816MiB, max=0, API 96/96, OOMKilled=false로 검증을 완료했다**. Render 공개 배포와 GitHub commit/push는 진행하지 않았다.

## 1. 제공된 Linux 시험의 실제 결과

근거: `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-readonly-startup\docker_20261019T020615Z\result.json`.

| 항목 | 최적화 전 실제 측정 | 최적화 후 Linux |
| --- | ---: | --- |
| 실제 R2 다운로드 및 SHA-256 | 14/14 성공 | 14/14 성공 |
| 다운로드·검증 단계 종료 | 18.878초 | 21.042초 |
| 서버 준비 완료 | 70.093초 | 74.078초 |
| API 성공 | 96/96 | 96/96 |
| memory.peak | 512.000MiB | 426.184MiB |
| 종료 전 memory.current | 506.941MiB | 402.812MiB |
| memory.events max | 223 | 0 |
| oom / oom_kill | 0 / 0 | 0 / 0 |
| OOMKilled | false | false |
| 재시작 | 0 | 0 |
| 기록 당시 상태 | Running=true, ExitCode=0 | Running=true, ExitCode=0 |
| 평균 / 최대 응답시간 | 0.716 / 3.610초 | 0.663 / 3.203초 |

Running=true일 때의 ExitCode=0은 프로세스가 정상 종료됐다는 뜻이 아니다. 서버는 시험 완료 시까지 실행됐으며 이후 시험 도구가 시험 컨테이너만 제거했다. max=223은 최대 경계 초과 직전에 직접 회수를 시도한 횟수이며 OOM 횟수와 다르다. 실제 oom=0, oom_kill=0, OOMKilled=false이므로 해당 로그에서 OOM 종료 증거는 없다. [Linux cgroup v2 공식 문서](https://docs.kernel.org/admin-guide/cgroup-v2.html).

## 2. 단계별 메모리와 원인 판단

| 구간 | docker stats 관측 최고값 |
| --- | ---: |
| 다운로드·스트리밍 해시 검증 | 38.37MiB |
| Python/Flask/Pandas 로딩 및 CSV 초기화 | 271.10MiB |
| 기동 후 전체 파일 재해시 | 263.50MiB |
| 96개 API 작업 | 328.40MiB |

이 표는 단계 시간에 속하는 **샘플의 최고값**으로, cgroup memory.peak와 같은 지표가 아니다. Docker Linux CLI는 전체 메모리에서 비활성 파일 캐시를 제외한다. cgroup v2에서는 이 제외값이 memory.stat의 inactive_file이다. 따라서 docker stats를 Python RSS로 부르는 것도 정확하지 않다. [Docker 공식 stats 문서](https://docs.docker.com/reference/cli/docker/container/stats/).

전체 512MiB 도달과 docker stats 328.4MiB 최고값의 차이는 파일 캐시가 중요한 원인이라는 강한 정황이다. 다만 서로 다른 시점의 최고값을 빼서 정확한 캐시 크기를 계산할 수 없다. 이전 로그에는 memory.stat, PID별 RSS, 단계별 memory.events가 없으므로, 223회가 어느 단계에서 발생했는지 또는 피크 당시 anon/file/dirty의 정확한 비중은 확정할 수 없다. **Python 메모리 누수로 단정하지 않는다.** 재시험은 그 구분을 직접 기록한다.

현재 파일 처리 흐름에서 캐시가 증가할 수 있는 지점:

1. 231.29MiB 다운로드 본문을 일반 디스크에 쓰면 커널 dirty 페이지가 생긴다. 스트리밍은 Python 버퍼를 제한하지만 디스크 페이지 캐시까지 제한하지는 않는다.
2. 임시 파일은 대상 파일과 같은 디렉터리의 일반 파일이며 검증 후 os.replace로 같은 inode를 이름 변경한다. 성공 시 임시·최종 파일을 두 벌 복사하는 구조가 아니다. 실패한 임시 파일은 finally에서 삭제된다.
3. CSV를 다시 읽어 Pandas의 객체/숫자/범주형 배열을 만들 때 프로세스의 익명 메모리와 파일 캐시가 함께 존재한다. 원본 CSV 크기 약 229.39MiB가 이 과정의 주된 파일 읽기 부하다.
4. 기동 후 `--verify-local` 재해시 역시 CSV 전체를 읽으므로 캐시를 다시 채울 수 있다. PNG/JSON 전체 크기는 CSV보다 작지만 같은 파일 캐시 규칙을 따른다.
5. 기존 시험은 데이터 tmpfs 마운트를 사용하지 않았다. 일반 디스크의 파일 크기 자체가 항상 같은 크기의 비회수 RAM을 차지하는 것은 아니다. tmpfs라면 shmem으로 RAM을 차지할 수 있으므로, 여유 확보 목적으로 데이터를 tmpfs로 옮기지 않는다.

## 3. 적용한 최소 변경

| 파일 | 변경 |
| --- | --- |
| backend/chargegap_api/file_cache.py | Linux의 one-pass CSV reader. 소비한 데이터 구간을 8MiB 단위로 POSIX_FADV_DONTNEED 처리. 미소비 read-ahead는 제외. 지원하지 않으면 일반 IO/무해한 fallback |
| backend/chargegap_api/data.py | 대용량 CSV를 이 reader로 전달. usecols, dtype, 결측값·정규화·검증·집계는 그대로 유지 |
| deploy/render/download_data.py | 기존 1MiB 스트리밍 유지. 8MiB 쓰기마다 flush/fdatasync 후 캐시 반환 요청. 검증용 digest도 1MiB 스트리밍 해시와 소비 페이지 반환 |
| backend/tests/test_file_cache.py | 한글·인용부호·개행·ID·범주형 파싱 동일성, read/read1/readinto/readinto1 바이트 보존, 처리 구간 경계 및 fallback 검증 |
| deploy/render/tests/test_deployment.py | 쓰기 완료 뒤 캐시 반환 순서, SHA 유지, 지원하지 않는 advice 환경에서도 해시 실패 차단 검증 |

캐시 반환은 내용 변경이나 파일 삭제가 아니다. 이미 Python 버퍼로 읽은 바이트의 파일 페이지를 커널에 반환하도록 힌트를 준다. DONTNEED는 advisory이므로 모든 파일시스템이 반드시 같은 수준으로 회수한다는 보장은 없다. 쓰기 구간은 dirty 페이지 상태에서 회수되지 않는 문제를 줄이기 위해 fdatasync를 먼저 수행한다. 실제 디스크 오류는 다운로드 실패·재시도·원자적 교체/임시 파일 정리 흐름으로 처리한다.

global drop_caches, root 권한, 스왑 추가, 메모리 제한 상향, 파일 삭제, 집계 축소는 사용하지 않았다. 서버 시작 때 필요한 실제 자료의 파일명·크기·SHA-256, Docker Compose 포트 18080, Waitress 및 수치 라이브러리 1스레드 설정도 그대로다. 로컬 Docker 설정 파일·React·기존 보고서·PNG는 변경하지 않았다.

## 4. 정확성·회귀 검증

명령:

```powershell
& '.\backend\.venv\Scripts\python.exe' -B -m pytest backend/tests deploy/render/tests -q -p no:cacheprovider --basetemp=work/r2-cache-optimization/pytest-temp
```

결과: **118 passed in 14.64s**. 기존 110개 및 추가 8개 검증이 모두 통과했다. 기존 API 10개, 필터·빈 결과·잘못된 요청·bbox·페이지네이션 및 이미지 조회 검증을 포함한다.

선행 메모리 최적화 당시 저장한 응답과 새 프로세스로 비교했다. 일반 Windows 경로와 Linux에서 사용하는 SnapshotReader를 강제로 적용한 경로 각각에 대해 **104/104 HTTP 상태·JSON 해시가 동일**했다. 각 경로에서 **전국 지도 101,091행 전체의 좌표·개수·지역·정렬 결과 SHA-256도 일치**했다. 전체 지도 해시: `19f3ec5bb59d732eea589051bc83351a6400c1500a77c32adb747752eb4c6c06`.

충전기 527,433기, 충전소 101,091곳, 비삭제 523,312기, 삭제 4,121기, 전기차 등록 899,101대를 유지한다. 충전기는 2026-10-15 조회 자료, 전기차 등록은 2025-12이며 비삭제 표시를 실제 이용 가능 상태로 해석하지 않는다.

Windows 프로세스 peak RSS 비교:

| 조건 | Peak RSS |
| --- | ---: |
| 선행 최적화 코드 기준 결과 | 300.496MiB |
| 이번 코드, 일반 Windows reader | 300.922MiB |
| 이번 코드, SnapshotReader 강제 적용 | 300.516MiB |

Windows에는 해당 Linux cache advice 기능이 없으므로 이 수치를 Linux 캐시 절감량으로 해석하지 않는다. 차이는 1MiB 미만이며 Pandas 스냅샷 deep memory는 두 경로 모두 187.262MiB로 같다. 이번 변경은 데이터 배열 크기를 줄이는 변경이 아니라, Linux 파일 캐시의 동시 잔류를 줄이는 변경이다. 실제 Linux에서의 종합 효과는 아래 완료된 Docker 재시험으로 확인했다. 각 advice 호출의 커널 내부 효과를 독립 계측한 것은 아니다.

원본 CSV·PNG·JSON 14개는 manifest 크기·SHA-256과 모두 일치한다. R2에 PUT/DELETE 요청을 보내지 않았고 객체나 인증정보를 수정하지 않았다. 테스트 및 원본/다운로드 자료는 다시 수집하거나 전처리하지 않았다.

## 5. 실제 R2 Docker 재시험

Codex 환경에서는 Docker 접근이 거부됐으나, 사용자 PC의 일반 PowerShell에서 실행된 `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-cache-optimization\docker_20261019T021506Z\result.json`의 완료 결과를 확인했다. **PASS, 96/96 성공, OOMKilled=false, max=0**이다. 아래 명령은 동일 시험의 재현용이며 현재 결과를 확인하기 위한 추가 재실행은 필요하지 않다.

사용자 PC의 일반 PowerShell에서:

```powershell
Set-Location -LiteralPath 'C:\Users\User\Documents\Codex\CHARGE GAP'
& '.\backend\.venv\Scripts\python.exe' -B '.\work\r2-cache-optimization\run_docker.py' --build --repeats 3
```

새 이미지 `charge-gap-render:r2-cache-test`를 빌드한다. 기존 로컬 Compose 이미지·설정과 분리하며 CSV/PNG/인증정보를 이미지에 포함하지 않는다. 깨끗한 컨테이너에서 R2의 14개 파일을 실제 다운로드하고 SHA-256을 검증한다. 메모리 512MiB, CPU 0.1, 추가 swap 없음, 실제 배포 CMD를 사용한다. 96개 API 요청 중 병렬 구간의 클라이언트 수는 4다. localhost의 임의 포트를 사용하고 고유 이름의 시험 컨테이너만 정리한다. 인증정보 값은 인수·로그·결과에 출력하지 않는다.

추가 계측:

- 약 1초 간격 memory.current/peak, memory.stat 전체 숫자 항목 및 memory.events.
- anon, file, inactive_file, active_file, file_dirty, file_writeback, shmem, kernel과 PID1 VmRSS/RssAnon/RssFile.
- 실제 다운로드·초기화·기동 후 SHA 재검증·API 작업의 구간별 샘플 최고값.
- docker stats 및 CPU throttling, 전체/평균/최대 응답시간, OOMKilled, 재시작.

file_dirty, inactive_file 등은 file과 중복되는 부분 집합이고 kernel_stack 등은 kernel의 부분 항목이므로 모두 더해 총메모리로 계산하면 안 된다. PID1 RSS는 다운로드 자식 프로세스와 계측 프로세스의 RSS를 포함하지 않으며 cgroup anon과 같은 값이 아니다. 작은 stdlib 계측 프로세스의 메모리도 제한/peak에 포함하므로 최종 메모리 여유는 그 비용까지 포함한 보수적 측정이다. CPU 성능 비교에서도 계측 비용을 감안한다.

최고 메모리는 커널의 memory.peak로 판정하며 구간별 샘플은 짧은 피크를 놓칠 수 있다. 결과는 `work/r2-cache-optimization/docker_<시각>/result.json`에 기록된다. 원본 기존 결과 JSON은 보존한다. 정상 시험은 GET 14회 정도·231.29MiB 전송을 추가하며, 재시도 시 요청이 늘 수 있다. 불필요한 반복 다운로드는 하지 않는다.

이번 목표의 보수적인 합격 기준은 **API 96/96, 실제 다운로드·SHA 14/14, OOMKilled=false, oom_kill=0, 재시작 0회, memory.events max=0, 최고 448MiB 이하(최소 64MiB 여유)**로 정했다. 64MiB는 Render의 공식 요구사항이 아닌 이 프로젝트의 안전 여유 목표다. 요청이 전부 성공해도 이 목표를 충족하지 못하면 배포 여유는 미확보로 보고한다.

## 6. Render 배포 판단과 후속 우선순위

**메모리·기능 사전 검증 PASS: 실제 R2 다운로드부터 96개 API 요청까지 목표한 메모리 여유를 확보했다.** 현재 결과로 무료 Render 자원 조건의 기술 사전 검증은 통과했다. 실제 Render 기동/cold start와 데이터 공개 이용 조건 확인이 남아 있으므로 공개 배포 준비의 종합 판정은 CONDITIONAL PASS이다.

1. 완료된 시험은 raw cgroup peak 426.184MiB·max=0·96/96 성공으로 메모리 제약 사전 검증을 통과했다. 동일 시험을 불필요하게 반복하지 않는다.
2. file/dirty가 계속 크면 파일시스템의 advice 처리 여부, writeback·read-ahead, overlay/tmpfs 차이를 분석한다. 캐시 제외값만 보고 한도 여유를 주장하지 않는다.
3. file은 줄었는데 anon이 높으면 CSV의 문자열 정규화 임시 배열·파서 버퍼·지도 집계를 단계별로 측정한 뒤 범주 정규화/로딩 중간 배열을 추가 개선한다. 현재는 API를 바꾸는 집계 축소나 무제한 캐시를 추가하지 않는다.
4. 실제 Render의 디스크·네트워크·커널은 로컬 Docker와 다르므로 공개 URL에서 콜드 부팅, HTTPS/CORS, 프론트엔드 API 오류 처리와 지도를 확인한다. 유휴 종료 후 재다운로드가 필요하다는 운영 제약을 유지한다.
5. 데이터별 미확정 공개 이용 조건과 출처 표시를 확정하고, 읽기 전용 토큰의 6개월 만료 전에 교체한다. 비공개 버킷 보관 승인이 공개 웹 서비스 제공 권한을 대신하지 않는다. 서비스 생성·commit/push는 별도 사용자 승인 후 진행한다.

## 7. 증거 및 신규 파일

- `work/r2-cache-optimization/analysis.json`: 수치·판정 요약.
- `work/r2-cache-optimization/after.json`, `wrapped.json`: 각각 104개 응답 및 전국 지도 해시.
- `work/r2-cache-optimization/baseline_sources/`: 수정 전 코드 사본. 기존 데이터 사본을 추가로 만들지 않았다.
- `work/r2-cache-optimization/run_docker.py`, `cgroup_probe.py`: 재시험 및 읽기 전용 자원 계측 도구. work/는 Git 제외 대상이다.
- 이 보고서는 신규 파일이며 기존 분석/검증 보고서를 덮어쓰지 않았다.


## 8. 실제 Linux 재시험 완료 결과 및 원인 구분

근거: `C:\Users\User\Documents\Codex\CHARGE GAP\work\r2-cache-optimization\docker_20261019T021506Z\result.json`. 이미지: `sha256:3e2b8d462cf33c3e36aa459b4246dd531d227389b53b53eebcd5e28844170dd9`. 512MiB·0.1 CPU, 실제 배포 CMD, 데이터 bind mount 없이 R2에서 14개 파일 다운로드, 메모리 계측용 소형 Python 프로세스 포함.

- 커널 memory.peak: **426.184MiB**, 기존보다 **85.816MiB 감소** (16.76%).
- 최고값 기준 여유: **85.816MiB**. 목표인 최소 64MiB 여유를 충족한다.
- memory.events의 max/oom/oom_kill 모두 **0**. OOMKilled=false, 재시작 0회, 서버 Running=true. 기존 시험도 OOM은 없었으며 이번 개선은 메모리 경계 회수 압력을 해소한 것이다.
- API 96/96 성공. 기존 Linux 결과와 `(wave, name, path)` 단위로 비교한 **96개 HTTP 응답 본문 SHA-256이 전부 동일**하다. 지역·유형·삭제·기관 복합 필터와 지도·bbox를 포함한다.
- 실제 R2 다운로드 및 SHA-256 14/14, 총 242,521,708 bytes. 기동 후 별도 전체 SHA 재검증도 성공했다.
- 다운로드·검증 단계 종료 21.042초 (기존 18.878초), 서버 준비 74.078초 (기존 70.093초). 약간 증가했으며 writeback·계측·빌드/네트워크 차이 등이 섞인 단일 시험 비교이므로 특정 원인 하나로 단정하지 않는다.
- 응답 평균/최대 0.663/3.203초, CPU 관측 평균 9.75%·최대 10.64% (호스트 1 CPU=100% 기준). 0.1 CPU quota의 정상적인 throttling이 있으며 응답시간은 특정 호스트의 관측값이다.
- 시험 컨테이너 정리 성공. 원본 14개 파일은 시험 전후 manifest 크기·SHA-256 일치. 기존 로컬 Compose 및 R2 객체 변경 없음.

단계별 샘플 최고값, 단위 MiB:

| 단계 | cgroup current | anon | file | file_dirty | file_writeback | PID1 RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| download | 67.230 | 33.961 | 29.375 | 7.016 | 8.000 | 15.578 |
| data_loading | 411.188 | 253.348 | 165.047 | 0.031 | 0.000 | 275.203 |
| post_startup_hash_check | 410.121 | 247.625 | 155.855 | 0.000 | 0.000 | 254.613 |
| api_workload | 403.016 | 294.484 | 99.914 | 0.004 | 0.000 | 319.488 |

각 열의 최고값은 같은 시각이 아닐 수 있으므로 열별 최고값을 합산하지 않는다. 표의 최고 current는 샘플값이고 1초 미만의 피크는 커널 memory.peak 426.184MiB에만 잡힐 수 있다.

가장 큰 current 샘플은 기동 후 72.297초에 411.188MiB였다. 그 샘플의 anon=253.348MiB, file=151.051MiB, kernel=5.309MiB, inactive_file=139.559MiB, PID1 RSS=275.203MiB이다. 각 cgroup 파일은 순차로 읽으므로 미세한 시차는 존재한다. 이 샘플에서 dirty/writeback/shmem은 0이다. **원시 cgroup 사용량에는 프로세스 메모리 외에 상당한 파일 캐시가 실제 포함된다**는 것을 확인했다. file에는 CSV뿐 아니라 Python/Pandas 라이브러리 등 다른 파일 페이지도 포함될 수 있다.

다운로드 단계 dirty 페이지의 관측 최고값은 약 7.016MiB, writeback은 8MiB였으며, 기존 231MiB 전체 크기를 dirty 상태로 계속 남겨 두는 대신 작은 쓰기 구간의 완료·회수를 요청하도록 한 설계와 부합한다. CSV 로딩에서는 프로세스 anon/RSS 증가도 관측됐으므로 모든 메모리를 파일 캐시라고 분류하지 않는다. 임시 파일을 최종 파일로 이름 변경하는 구조는 유지되며, 파일 데이터를 tmpfs로 이동하지 않았다.

이번 결과는 cache IO 경로만 바꾸고 데이터·집계·응답을 유지한 상태에서 max 이벤트와 전체 피크가 낮아졌다는 증거다. 이전 로그에 memory.stat가 없어 당시 512MiB를 구성했던 정확한 항목 비율을 역산하거나, 각 advice가 몇 바이트를 줄였는지 분해할 수는 없다. **512MiB 도달만으로 Python 누수라고 했던 진단은 타당하지 않으며, 현재 목표에 대한 추가 메모리 수정은 필요하지 않다.**

실제 Render 서비스의 커널/디스크/네트워크는 다를 수 있고 무료 서비스 유휴 종료 후에는 재다운로드가 필요하다. 공개 이용 조건 확정, 승인된 코드 반영, Render 비밀 환경변수·실제 CORS/API 주소 설정, HTTPS cold-start 실검증을 다음 단계로 남긴다. 현재 작업에서는 서비스 생성이나 push를 하지 않았다.

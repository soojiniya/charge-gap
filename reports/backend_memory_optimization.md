# CHARGE GAP Flask 메모리 최적화 검증

작성일: 2026-10-18. 기존 데이터·PNG·분석 보고서·React·로컬 Docker 구성을 유지했다. 데이터 재수집, GitHub push, Render 배포는 수행하지 않았다.

## 현재 결론

**메모리 제한 시험 PASS. 실제 Render 배포 준비는 CONDITIONAL PASS.**

최적화 전 Linux 시험에서는 지도 요청 중 OOMKilled=true / ExitCode=137로 종료됐다. 이번 변경 후 Windows의 동일 부하 비교에서 최고 RSS가 727.496MiB에서 300.496MiB로 58.69% 감소했다. 기존 테스트 82개와 추가 회귀 테스트 4개가 통과했으며, API 요청 104건의 상태 코드와 JSON 전체 내용 및 전국 충전소 101,091곳의 지도 전체 결과가 이전 구현과 일치한다.

Docker 엔진 직접 접근은 이 실행 환경에서 차단됐지만, 사용자가 일반 PowerShell에서 최적화 이미지를 빌드하고 시험을 실행했다. 생성된 상세 JSON을 확인한 결과 **512MiB와 512MiB＋0.1 CPU 각각 96/96건 성공, OOMKilled=false, 재시작 0**이다. 최고 메모리는 각각 395.945MiB / 294.684MiB다. 이번 제한 조건에서는 전체 API 부하가 통과했다. 실제 Render 배포·장기 운영은 아직 검증하지 않았다.

## 변경 파일

- `backend/chargegap_api/data.py`: 사전 categorical 저장, 무필터 복사 제거, 관측 category만 집계, 작은 삭제 표시 보조 열, 지도 정렬 대상 축소.
- `backend/tests/test_memory_regression.py`: 대표 좌표·잘못된 좌표 형제 충전기 합계·문자열 ID 정렬·미관측 category·원본 불변성 회귀 테스트 4개.
- 이 새 보고서. 기존 보고서는 수정하지 않았다.

프로젝트 외부 작업 도구:

`<이전 작업 폴더>\work\memory_optimization`

- `baseline_package/chargegap_api/`: 변경 전 소스의 비교용 복사본.
- `compare_worker.py`, `before.json`, `after.json`: 새 프로세스에서 같은 API 부하/메모리 비교.
- `verification.json`: 응답 비교·보존·메모리 요약.
- `run_linux_optimized.py`, `container_probe.py`: 최적화 이미지의 제한 시험. 기본 조건별 32건 × 3회.

## 구현 상세

### 데이터 저장

동일 문자열 반복이 많은 11개 열을 CSV 파싱 단계부터 category로 읽고, 기존과 같은 앞뒤 공백 제거 후 category 사전을 재구성한다. 정규화에 따른 중복 병합 및 문자열 기준 정렬 순서를 유지한다.

| 열 | 이전 | 이후 |
|---|---|---|
| statId, chgerId, statNm, addr | object 문자열 | category |
| chgerType, zcode, delYn | object 문자열 | category |
| busiId, busiNm, stat, output | object 문자열 | category |
| lat, lng, statUpdDt, _fetched_at | object 문자열 | 유지 |
| _lat, _lng, _output_kw | float64 | 유지 |

ID 앞자리 0 및 output의 원문·빈 문자열을 보존한다. 위도·경도 수치 정밀도를 줄이지 않았다. 범주형 groupby는 `observed=True`로 관측하지 않은 지역·유형·조합이 가짜 0건 행/표본으로 생기지 않도록 한다. 반환 집계 키는 object로 복원해 라우트의 map/fillna 처리와 기존 JSON 의미를 유지한다.

### 필터 및 집계

무필터 select는 새 전체 프레임 대신 기존 스냅샷을 읽기 전용으로 참조한다. 필터가 있으면 같은 조건을 적용해 별도 선택 프레임을 만든다. 호출부는 원본을 변경하지 않으며, 반복 요청 전후 전체 스냅샷 해시 불변성을 테스트했다.

삭제 표시 합계 보조 열은 int64 대신 bool을 사용하고 집계 결과는 동일한 정수로 반환한다. 캐시는 추가하지 않았다. 따라서 필터 조합 캐시 혼합/무제한 캐시 증가 문제가 새로 생기지 않는다.

### 지도

이전: 유효 좌표 행의 전체 18개 열 복사 → 전체 열을 들고 삭제 표시/충전기 ID 정렬 → 충전소 대표 행 선택.

이후: statId·delYn·chgerId의 작은 키 프레임만 복사/정렬 → 대표 행 인덱스 선택 → 해당 충전소들의 필요한 응답 열만 가져오기.

모든 필터 일치 충전기의 충전소별 합계는 별도로 계산한다. 유효하지 않은 좌표의 형제 충전기도 합계에 포함한다. 대표 좌표는 N 우선 / 문자열 chgerId 순 첫 유효 행이다. bbox는 대표 좌표에 적용하며 statId 정렬·페이지네이션·메타데이터를 유지한다. endpoint 및 라우트 JSON 구조는 변경하지 않았다.

## 로컬 메모리 비교

| 측정 항목 | 이전 | 이후 |
|---|---:|---:|
| 데이터 로딩 뒤 RSS | 207.289MiB | 192.375MiB |
| 초기 준비 구간까지 OS 최고 RSS | 273.180MiB | 244.969MiB |
| 동일 부하 중 OS 최고 RSS | **727.496MiB** | **300.496MiB** |
| DataFrame memory_usage(deep=True) 합계 | 494.570MiB | 187.262MiB |

OS 최고 RSS는 Windows GetProcessMemoryInfo의 PeakWorkingSetSize다. 각 구현은 새로운 Python 프로세스에서 실행했다. API 10종 기본 요청, 삭제/지역/유형/운영기관/복합/빈 결과 필터, 지도 페이지·bbox·잘못된 요청, 16개 지역 출력, 4개 클라이언트 동시 요청 3회 등 총 104건을 동일하게 처리했다. Flask test client를 사용한 프로세스 메모리 비교이며 실제 TCP Waitress/Linux cgroup 측정은 아니다. 최적화 후 실행 일부는 pytest와 호스트 자원을 공유했으므로 실행시간을 엄격한 성능 벤치마크로 해석하지 않는다.

deep=True 합계는 pandas의 문자열/사전 포함 크기 추정치로 RSS와 다르다. 객체 문자열의 공유 메모리가 반복 계산될 수 있다. 전체 지도 해시를 위해 수행한 추가 검증은 위 workload 최고값 기록 이후 별도 수행했다.

Windows 300.496MiB를 512MiB에서 빼 Linux 잔여 메모리로 제시하지 않는다. 실제 Linux 컨테이너는 파일 캐시·할당자·런타임 차이도 있으므로 별도 측정이 필요하다.

## 정확성 및 테스트

- `python -B -m pytest backend/tests -q -p no:cacheprovider`: **86 passed (10.55초)**.
- 기존 Flask 82개 통과 확인 후 추가 4개를 포함해 통과했다.
- 최적화 전/후 API 104건의 `(path, status, JSON canonical SHA-256)` 차이 0건. data와 meta 전체를 비교했다.
- 전국 지도 101,091행 전체의 좌표·이름·주소·지역·합계·행 순서 직렬화 해시 동일:
  `19f3ec5bb59d732eea589051bc83351a6400c1500a77c32adb747752eb4c6c06`.
- 전국 지도, bbox, 페이지 1/2/마지막, 삭제 필터, 복합 필터, 관측 0건 유형 및 잘못된 파라미터 응답 비교를 포함했다.
- 기존 테스트는 527,433기 / 101,091곳 / 비삭제 523,312기 / 삭제 4,121기 / 전기차 899,101대와 지역/유형/운영기관 집계 및 박스플롯 통계를 검증한다.
- 추가 합성 데이터는 N 우선, 문자열 ID '10'과 '2' 정렬, 잘못된 좌표 형제 합계, 필터 후 대표 좌표 변경, 미관측 category 제거, 빈 결과를 검증한다.
- 반복 API 뒤 스냅샷 해시 동일성을 확인했다.
- `git diff --check`: 오류 없음. Windows 줄바꿈 변환 안내만 있다.

검증 범위 구분: 최초 프로젝트 루트 전체 pytest 수집은 backend 전용 가상환경에 requests가 없어 기존 수집기 테스트에서 import 오류가 발생했다. 수집기 의존성을 설치하거나 수집을 실행하지 않고 요청 범위인 backend/tests로 제한해 위 86개를 검증했다. 수집기 코드·의존성은 변경하지 않았다.

## Linux 512MiB 재검증 결과

완료 결과 폴더:

`<이전 작업 폴더>\work\memory_optimization\results_20261018_182951_de2c23`

최적화 이미지 ID: `sha256:4d9e802dfacae6cc500b8b1e6c6ca9a4d73433ac9b19b5d84d8780d6367aba5e`.

| 실제 측정 항목 | 512MiB / CPU 무제한 | 512MiB / 0.1 CPU |
|---|---:|---:|
| 기동·데이터 로딩 | 성공 | 성공 |
| 준비 완료 | 8.015초 | 56.843초 |
| 반복별 성공 | 32/32 × 3회 | 32/32 × 3회 |
| 전체 API 성공 | **96/96 (100%)** | **96/96 (100%)** |
| cgroup memory.peak | **395.945MiB** | **294.684MiB** |
| 한도 대비 관측 여유 | **116.055MiB** | **217.316MiB** |
| OOMKilled / oom_kill 이벤트 | false / 0 | false / 0 |
| memory.events.max | 0 | 0 |
| 자동 재시작 | 0 | 0 |
| 정리 전 상태 | Running=true | Running=true |
| 평균 / 최대 응답시간 | 0.067초 / 0.281초 | 0.655초 / 3.218초 |
| Docker stats 평균 / 최대 CPU | 56.79% / 99.81% | 9.67% / 10.62% |
| Docker stats 샘플 수 | 27 | 189 |
| 이미지/호스트 소스 일치 | true | true |

CPU %는 1 CPU 기준 관측 샘플 값이며 짧은 quota burst로 순간값이 10%를 조금 넘을 수 있다. 두 조건의 메모리 차이를 CPU 제한만의 효과라고 해석하지 않는다. 파일 캐시의 귀속/재사용·실행 타이밍 등도 다를 수 있으므로 보수적으로 더 높은 **395.945MiB**와 여유 **116.055MiB**를 참고한다.

이전 구현은 같은 512MiB 한도에서 두 조건 모두 최고값이 제한에 도달하고 지도 요청 중 OOM 종료됐다. 이전 최고값은 제한으로 잘린 값이므로 무제한 실제 필요 메모리와의 감소율을 계산하지 않는다. 새 시험은 이전보다 많은 96건을 수행하고 모두 살아 있는 상태로 마쳤다.

stats 파싱 오류는 0, stderr 파일은 비어 있다. stats 프로세스 returncode=1은 시험 컨테이너 정리/관측 프로세스 종료 시점에 기록된 것이며 애플리케이션 종료 코드나 API 실패를 의미하지 않는다. 정리 전 애플리케이션 State.Running=true, OOMKilled=false를 확인했다. ExitCode=0 필드가 있어도 실행 중 상태이므로 정상 종료 완료를 뜻한다고 해석하지 않는다.

시험 전후 보호 manifest 235개는 변경/추가 0개다. 이 최종 보고서 보완은 해당 시험이 끝난 뒤 수행했다. 관측은 단기 3회 반복이며 장기 부하, 실제 Render 네트워크/플랫폼 특성까지 보증하지 않는다.

### 재현 명령

이 환경에서는 Docker API 접근 권한이 거부된다. 사용자는 일반 PowerShell에서 아래 명령을 실행할 수 있다.

먼저 기존 Compose 기본 이미지를 대체하지 않는 **별도 태그**로 빌드한다.

```powershell
docker build -f "<프로젝트 폴더>\backend\Dockerfile" -t charge-gap-backend:memory-optimized "<프로젝트 폴더>"
```

빌드 성공 후:

```powershell
& "<프로젝트 폴더>\backend\.venv\Scripts\python.exe" -B "<이전 작업 폴더>\work\memory_optimization\run_linux_optimized.py"
```

빌드와 시험을 한 번에 실행하려면 같은 Python 명령 끝에 `--build`를 붙인다. 별도 memory-optimized 태그만 빌드하며 기존 Compose 기본 태그는 유지한다.

최초 사용자 측 재검증 시도 `results_20261018_182854_b94ab4`는 Docker 엔진에는 연결됐으나 `No such image: charge-gap-backend:memory-optimized`로 사전 점검에서 중단됐다. 부하나 메모리 시험 실패가 아니며 실행된 API 요청은 없다. 이후 `--build` 옵션을 추가해 해당 의존 단계를 한 명령으로 처리할 수 있게 했다.

시험 조건:

- 512MiB 및 512MiB＋0.1 CPU; Waitress 요청 스레드 1, BLAS/OpenMP 등 1.
- swap 추가 사용 금지, 재시작 no, CSV 및 메타데이터/PNG 읽기 전용 마운트.
- 조건별 32건 × 3회 = **96건**, 총 192건. 순차·지역 동시 요청·전국 지도·bbox·복합 필터·혼합 동시 요청 포함.
- 실제 제한, 시작/로딩, cgroup 최고/현재 메모리·OOM, CPU, 응답시간, 종료/재시작 상태 기록.
- 이미지 내부 Python 소스 SHA-256과 호스트 소스를 비교해 이전 이미지를 잘못 시험하는 상황 검출.
- 기존 도구와 달리 stats 출력의 ANSI 제어 문자를 제거하고 파싱 실패 수/첫 원문, stats stderr 파일, HTTP 예외 원문/상태/본문을 보존한다. Docker stats 수집 개선의 실제 작동은 실행 후 확인해야 한다.
- 컨테이너 종료를 감지하면 후속 부하를 중단한다. summary의 PASS는 두 조건 전체 요청·이미지 일치·OOM 없음·Running·재시작 0을 모두 만족해야 한다.
- 기존 Compose 포트 18080을 변경하지 않으며, 임시 컨테이너만 별도 loopback 임의 포트로 실행하고 정리한다.

실제 결과의 RESULT 경로에서 위 항목을 확인했다. 이번 시험 이후 코드를 다시 변경한다면 같은 조건을 재검증해야 한다. 짧은 시험 성공만으로 장기 실사용/Render 네트워크·슬립·플랫폼 정책까지 검증했다고 주장하지 않는다.

## 보존 및 남은 항목

기존 234개 manifest와 대조했을 때 변경된 기존 파일은 허용된 `backend/chargegap_api/data.py` 1개뿐이었다. 나머지 233개(데이터·PNG·기존 보고서·기타 소스/설정)는 해시가 동일했다. 신규 테스트/본 보고서와 외부 비교·시험 도구만 추가했다. .env·인증키를 읽거나 이미지에 추가하지 않았으며, 기존 .dockerignore/Compose/Dockerfile/프론트엔드는 수정하지 않았다.

현재 측정에서는 추가 메모리 최적화가 필수인 증거가 없어 변경을 더 확대하지 않았다. 향후 부하에서 여유가 줄면 지도 대표 좌표/집계의 제한된 재사용, 불필요한 상주 문자열 축소, 더 작은 열 투영, 필요 시 읽기 전용 디스크 집계를 검토한다. 캐시는 상주 메모리를 늘릴 수 있으므로 먼저 추가하지 않았다.

**Render 배포 시 남은 조건:** 이번 시험과 동일하게 Waitress 요청 스레드 1 및 수치 라이브러리 스레드 1을 명시해야 한다. 기존 로컬 Dockerfile의 기본 CMD는 4스레드이며 요청대로 수정하지 않았다. 그대로의 기본 CMD 4스레드는 이번 제한 시험의 검증 대상이 아니다. Render 실행 명령/PORT, 프론트엔드 API 프록시·CORS, 비공개 데이터 공급 방식과 재배포 이용 조건을 별도로 구성·확인해야 한다. CSV나 인증키를 공개 이미지에 추가하지 않는다. 실제 Render 배포나 GitHub push는 수행하지 않았다.

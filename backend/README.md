# CHARGE GAP Flask 백엔드

정제 CSV와 기존 그래프를 읽는 조회 전용 백엔드입니다. HTML/CSS/프론트엔드는 포함하지 않습니다. 데이터 수집이나 그래프 생성은 실행하지 않습니다. 공공데이터 API 인증키 또는 프로젝트 `.env`를 읽지 않습니다.

## 실행

이 문서의 절대경로는 작성자 PC의 예시입니다. 새 PC는 프로젝트의 `backend` 폴더로 이동하세요. Git에서 제외된 전체 정제 CSV를 먼저 별도로 공급해야 합니다. 필요한 데이터 목록과 Linux/macOS 명령은 [상위 README](../README.md)에 있습니다. 백엔드 자체 경로는 코드 위치에 상대적으로 계산되며 Windows 전용 경로에 의존하지 않습니다.

PowerShell에서:

```powershell
Set-Location 'C:\Users\User\Documents\Codex\CHARGE GAP\backend'
.\.venv\Scripts\python.exe run.py
```

기본 주소: `http://127.0.0.1:5000`. 현재 백엔드 전용 `.venv`에 패키지가 설치되어 있습니다. 디버거와 자동 재로딩은 꺼져 있습니다. API는 2026-10-15 저장 스냅샷을 제공하며 현재 실시간 현황을 조회하지 않습니다.

새 환경 설치:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe run.py
```

이 Windows 환경에서 ensurepip가 실패하는 경우 상위 Python의 pip를 이용할 수 있습니다.

```powershell
python -m venv --without-pip .venv
python -m pip --python .venv\Scripts\python.exe install -r requirements.lock.txt
```

테스트:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

Waitress 실행(여전히 로컬 주소에만 바인딩):

```powershell
.\.venv\Scripts\waitress-serve.exe --host=127.0.0.1 --port=5000 --call chargegap_api:create_app
```

Flask 기본 서버는 로컬 개발·테스트용입니다. 별도 배포 시 WSGI 서버와 호스팅 환경을 구성해야 합니다. [Flask 공식 실행 안내](https://flask.palletsprojects.com/en/stable/quickstart/)

## 구조

```text
backend/
  run.py
  chargegap_api/
    __init__.py       # 앱 팩토리, JSON 오류, CORS
    data.py           # CSV 로드·집계·출처 및 유형 정의
    validation.py     # 파라미터·코드·숫자·bbox 검증
    routes.py         # REST API와 기존 PNG 제공
  tests/
    conftest.py
    test_api.py
  examples/           # 실제 HTTP 응답 JSON
  verification/       # 테스트·HTTP·원본 보존 검증 결과
  API_SPEC.md         # Claude 프론트엔드 연동 명세
  openapi.json        # OpenAPI 3.0.3 기계 판독 명세
  requirements.txt
  requirements-dev.txt
  requirements.lock.txt
```

## 데이터와 성능

기본 프로젝트 경로는 `backend`의 상위 디렉터리입니다. `data/processed/charger_info_clean.csv`, `ev_registration_by_region_2025.csv`, `charger_installation_trend.csv`, `reports/chart_verification.json`을 프로세스 시작 시 한 번 읽습니다. API별로 필터를 적용한 상세 충전기 행에서 다시 집계하므로 지역·유형·삭제·운영기관 필터를 조합할 수 있습니다. CSV나 PNG를 수정하는 기능은 없습니다.

데이터 로딩 후에는 메모리 스냅샷으로 처리합니다. 파일을 갱신해도 실행 중 자동 재로딩되지 않습니다. 새 스냅샷의 기준일·기대 건수를 코드/명세에 함께 반영한 후 서버를 재시작하세요. 시작 시 현재 작업의 기대 총수를 검사해 다른 스냅샷을 조용히 잘못 제공하지 않습니다.

실제 위치 반환은 요청당 최대 1,000개 충전소입니다. 필터 → 충전소 집계 → 대표 좌표에 bbox → 정렬/페이지네이션 순서입니다. 최초 로딩과 큰 범위 위치 집계에는 시간이 들 수 있으므로 프론트엔드에서는 지도 영역 bbox와 제한된 limit를 사용하세요. 빈 결과는 HTTP 200과 빈 배열입니다.

필터·응답 필드·기준 시점·주의사항은 [API_SPEC.md](API_SPEC.md)에 있습니다. [Flask 테스트 클라이언트](https://flask.palletsprojects.com/en/stable/testing/)를 사용한 테스트 및 실제 로컬 HTTP 검증 결과를 `verification/`에 저장했습니다.

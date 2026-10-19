# CHARGE GAP 무료 인터넷 배포 준비 검증

작성일: 2026-10-18. 판정: **CONDITIONAL PASS — 구성 작성/로컬 검증 완료, 실제 배포 미실행**.

## 변경 범위

이번 단계에서 수정한 기존 파일은 README.md뿐이다. 신규 파일:

- render.yaml
- deploy/render/Dockerfile
- deploy/render/Dockerfile.dockerignore
- deploy/render/download_data.py
- deploy/render/start.py
- deploy/render/data-manifest.json
- deploy/render/frontend.env.example
- deploy/render/tests/test_deployment.py
- docs/RENDER_DEPLOYMENT.md
- 이 보고서

Git에 보이는 backend/chargegap_api/data.py 및 메모리 회귀 테스트/보고서 변경은 이전 최적화 단계의 미커밋 작업이다. 이번 배포 준비에서는 최적화된 백엔드 소스를 수정하지 않았다. Linux PASS 이미지의 소스 manifest와 현재 Python 소스 4개 SHA-256이 일치한다.

기존 역사 manifest 234개와 비교 시 data.py(이전 단계)와 README(이번 단계)만 달랐고 나머지 232개는 동일했다. CSV·Excel·PNG·기존 분석 보고서·프론트엔드·Compose·로컬 Dockerfile/ignore를 변경하지 않았다.

## 검증 결과

| 항목 | 결과 |
|---|---|
| backend 기존 테스트 | 86개 통과 |
| 배포 준비 테스트 | 24개 통과 |
| 합계 | **110 passed, 14.51초** |
| 실제 런타임 파일 | 14개, 242,521,708바이트 / 231.287MiB, 크기/SHA-256 일치 |
| PNG 접근 | /api/charts 메타데이터가 가리키는 이미지 10개 모두 HTTP 200, 크기/SHA-256 일치 |
| CORS | 허용 HTTPS origin 헤더 및 미허용 origin 차단 헤더 정책 확인 |
| 부팅 설정 | PORT 반영, 0.0.0.0 / Waitress 1, 수치 스레드 1, 저장소 자격증명 exec 환경 제거 |
| 다운로드 | 1MiB bounded read, 크기/해시 실패·재시도·원자 교체·기존 파일 보존·주소/토큰 redaction 테스트 |
| React | TypeScript 검사 및 외부 HTTPS API origin을 넣은 production build 통과 |
| 프론트엔드 소스 | 수정 없음. 임시 production 출력은 프로젝트 외부 work/render_preparation/frontend-dist |
| Git 제외 | 데이터 CSV/Excel, .env, venv/node_modules 제외 확인 |
| Docker 엔진 | named pipe 접근 거부. 새 Dockerfile 실제 build/up 미검증 |
| 실저장소 인증 GET | 저장소/키를 만들지 않아 미검증 |
| 실제 Render TLS/CORS/라우터/지도 | 서비스 생성하지 않아 미검증 |
| Blueprint 서버측 검증 | 미실행. 공식 YAML 필드로 작성했으나 적용 전 확인 필요 |

최초 pytest 실행은 샌드박스 기본 임시 폴더를 만들지 못해 fixture setup 오류가 있었다. writable workspace 내부의 새 --basetemp로 실행해 110개 모두 통과했다. 프로젝트 의존성 추가나 전역 임시 폴더 삭제는 하지 않았다. 기존 폰트 상대 경로 경고는 빌드에 남아 있으며 공개 브라우저에서 fallback/404 확인이 필요하다. UI·폰트·디자인 소스는 변경하지 않았다.

이전 최적화 Linux 시험의 192건 PASS는 **다운로드 진입점 없이** 수행한 시험이다. 이번 다운로드는 1MiB 스트림과 별도 프로세스를 사용하고 Flask 실행 전 종료하지만, 다운로드된 파일 캐시를 포함한 새 이미지의 전체 기동 메모리까지 실측한 것은 아니다. 실제 저장소 연결 후 같은 제한으로 확인해야 한다.

## 배포 결정에 필요한 조건

구조, 14개 파일 목록/용량, 모든 환경변수, 저장소 비교, 출처/이용 조건 및 사용자별 실행 순서는 [상세 배포 안내](../docs/RENDER_DEPLOYMENT.md)에 기록했다. 가격/공식 근거 링크도 그 문서에 있다.

추천: React Render Static + Free Docker API + private R2 Standard. 무료 사용량 내 월 $0 예상이며 초과 청구·정지·유휴 재기동 지연이 없는 서비스로 보장하지 않는다. R2의 종량제 등록/checkout 조건을 사용자가 확인해야 한다. 이번에는 서비스·버킷·자격증명·계정·구독을 생성하지 않았다.

필수 남은 일:

1. EV/growth Excel 원문 및 파생물 공개 조건 확인. API 원문은 출처표시 제1유형 확인했지만 다른 입력까지 일괄 승인한 것으로 해석하지 않는다.
2. 저장소 선택·등록 조건 승인, private bucket 14개 파일 공급 및 읽기 전용 자격증명 설정.
3. 새 Render Dockerfile의 실인증 다운로드/기동/512MiB 및 cold start 검증.
4. 승인된 Git commit/push 후 실제 두 서비스 URL 결정, VITE_API_BASE_URL/CORS 설정, rewrite 및 HTTPS 기능 확인.

현재는 commit·push·Render 생성·인터넷 공개·유료 신청을 진행하지 않았다. 사용자의 다음 승인 단계에서 실제 배포를 진행할 수 있도록 준비했다.

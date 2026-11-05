/**
 * 데이터 출처 표기 (한 곳에서 관리).
 * - 제공기관·작성기관·자료명·자료 기준·파일 저장일(또는 조회 시각)·이용 조건을 구분합니다.
 * - 공개자료 목록의 제1유형 안내는 그 목록의 데이터셋에 적용됩니다.
 *   별도 데이터·통계 화면의 설치 추이 Excel에 적용되는지는 확인 중입니다.
 * - 백엔드 메타데이터(backend/chargegap_api/data.py의 *_SOURCE)와 같은 값이어야 합니다(tests/data-sources.test.cjs).
 */

export interface DataSourceInfo {
  /** 화면에 쓰는 짧은 이름 */
  label: string;
  /** 제공기관(자료를 내려받은 곳) */
  provider: string;
  /** 작성기관 */
  author: string;
  /** 제공 창구 */
  platform?: string;
  /** 자료명 */
  dataset: string;
  /** 자료 기준 (통계 기준 시점) */
  basis: string;
  /** 파일 저장일 또는 조회 시각 (수집 시점) */
  collected: string;
  collectedLabel: '파일 저장' | '조회';
  /** 이용 조건: confirmed=true 는 공식 페이지에서 확인된 경우만 */
  license: { confirmed: boolean; text: string };
  url: string;
}

export const DATA_SOURCES = {
  ev: {
    label: '전기차 등록',
    provider: '국토교통부 통계누리',
    author: '국토교통부',
    dataset: '「2026년 09월 자동차 등록자료 통계」 10.연료별_등록현황 (자동차등록현황보고)',
    basis: '2026년 9월 말 등록 기준',
    collected: '2026-10-20',
    collectedLabel: '파일 저장',
    license: { confirmed: false, text: '확인 중 (통계누리 저작권보호정책에 따라 출처 표시)' },
    url: 'https://stat.molit.go.kr/portal/cate/statMetaView.do?hFormId=1244&hRsId=58',
  },
  chargers: {
    label: '충전기 현황',
    provider: '한국환경공단',
    author: '한국환경공단',
    platform: '공공데이터포털',
    dataset: '「전기자동차 충전소 정보」 getChargerInfo',
    basis: '2026-10-15 조회 시점 현황',
    collected: '2026-10-15 04:16–04:19 KST',
    collectedLabel: '조회',
    license: { confirmed: true, text: '공공누리 제1유형 (출처표시)' },
    url: 'https://www.data.go.kr/data/15076352/openapi.do',
  },
  growth: {
    label: '충전기 설치 추이',
    provider: '무공해차 통합누리집',
    author: '원본 미기재',
    dataset: '데이터·통계 「충전기 설치 성장 추세」 2011–2026 (2026년 부분 연도)',
    basis: '집계 마감일 원본 미기재, 당시 공식 화면 갱신 표시 2026-09-30',
    collected: '2026-10-15',
    collectedLabel: '파일 저장',
    license: { confirmed: false, text: '확인 중 (공개자료 목록의 이용 안내는 이 표 적용 미확인)' },
    url: 'https://ev.or.kr/nportal/stats/statsDashboard.do',
  },
} as const satisfies Record<string, DataSourceInfo>;

/** 설치 추이: 보관한 당시 자료라는 사실과, 공식 표가 이후 과거 연도 값까지 고쳤다는 사실(원인은 공식 확인되지 않음) */
export const GROWTH_SNAPSHOT_NOTE = '이 그래프는 2026-10-15에 저장한 당시 표의 값이며 현재 공식 최신값이 아닙니다.';
export const GROWTH_REVISION_NOTE =
  '공식 화면은 이후 2026-10-31 갱신에서 과거 연도 수치까지 수정했고, 수정 사유는 공식적으로 확인되지 않았습니다.';

/**
 * 분석 근거 '데이터 출처' 문자열: "제공기관 · 항목 · 항목 …, /api/…".
 * sourceParts.parseSource가 항목을 나눠 표시합니다(문구는 바꾸지 않음).
 */
function sourceLine(s: DataSourceInfo): string {
  return [
    s.provider,
    s.author !== s.provider ? `작성기관 ${s.author}` : null,
    s.platform ? `제공 ${s.platform}` : null,
    s.dataset,
    `자료 기준 ${s.basis}`,
    `${s.collectedLabel} ${s.collected}`,
    `이용 조건 ${s.license.text}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export const EV_SRC = `${sourceLine(DATA_SOURCES.ev)}, /api/ev-registration`;
export const CH_SRC = sourceLine(DATA_SOURCES.chargers);
export const GROWTH_SRC = `${sourceLine(DATA_SOURCES.growth)}, /api/growth`;

/** 보고서 PNG 1~3번(등록)과 현재 웹 등록 그래프의 차이: 갤러리·상세 설명에 표시 */
export const EV_PNG_IDS: readonly number[] = [1, 2, 3];
export const EV_PNG_VS_WEB = {
  png: { month: '2025년 12월', regions: '당시 17개 시도 (광주·전남 따로)' },
  web: { month: '2026년 9월', regions: '현재 16개 지역 (전남광주 통합)' },
} as const;

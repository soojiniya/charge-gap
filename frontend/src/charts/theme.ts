/**
 * 차트 색상과 공통 축 스타일 (tokens.css와 같은 값, Dark Monochrome).
 * 무채색 7단계만 씁니다. 카드(#222222) 위에서 인접한 범주는 명도 차(L*)를 20 이상 두고,
 * 조각 사이 2px 카드색 간격·직접 레이블·선 스타일(실선/점선)로 함께 구분합니다.
 */
export const G = {
  g1: '#f5f5f5', // L* 96
  g2: '#d4d4d4', // L* 85
  g3: '#a3a3a3', // L* 67
  g4: '#737373', // L* 48
  g5: '#525252', // L* 35
  g6: '#404040', // L* 27
  g7: '#303030', // L* 20
};

export const C = {
  s1: G.g3, // 기본 단일 계열(막대·점·상자)
  s2: G.g5, // 두 번째 범주
  s3: G.g1, // 강조 범주·선택·부분 연도 표식
  s4: G.g4, // 네 번째 범주
  other: G.g6, // '기타' 묶음, 비강조
  compare: G.g1, // 기준선·회귀선·KDE 선(밝은 선, 점선과 함께 사용)
  point: G.g1, // 최고값·선택 강조
  dim: G.g6, // 선택되지 않은 막대
  grid: '#2e2e2e',
  axis: '#404040',
  ink: '#f5f5f5',
  ink2: '#d4d4d4',
  muted: '#b0b0b0', // 보조 텍스트·축 눈금 (tokens.css --muted)
  surface: '#222222',
  /** 단일 포인트 색(세이지 그레이). 핵심 수치·선택 데이터·그래프 강조점에만 씁니다. */
  accent: '#c7d8cf',
};

export const SERIES = [C.s1, C.s2, C.s3, C.s4];

/**
 * 차종별 등록 구성(그래프 2, 롤리팝 끝 점) 전용 색. 4개 차종을 회색만으로는 구분하기 어려워 이 차트에만 저채도 색을 씁니다.
 * 대시보드 전체 색 체계(무채색 + 세이지 포인트)는 그대로이며, 다른 차트에는 쓰지 않습니다.
 * 카드 #222222 위 대비: 승용 10.6 · 화물 6.1 · 승합 8.1 · 특수 5.4 (:1)
 */
export const VEHICLE_COLORS = {
  passenger: '#bfd8d0', // 승용 · 세이지 그린
  truck: '#a49bc8', // 화물 · 뮤트 라벤더
  bus: '#d2b48c', // 승합 · 샌드 베이지
  special: '#789cb0', // 특수 · 슬레이트 블루
} as const;

/**
 * 충전기 유형별 색(공통 매핑). 그래프 6 도넛과 Regional Explorer 지도 상세 패널의 '충전기 유형 구성' 막대가 함께 씁니다.
 * 그래프 2와 같은 톤을 유형 코드에 고정 배정하므로, 필터·지역 선택으로 순위가 달라져도 같은 유형은 항상 같은 색입니다.
 * 주요 유형(02·04·06·11·05)은 지정 색, 그 밖에 개별로 표시되는 유형은 코드별 고정 회청색(명도 차로 구분), '기타' 묶음은 #92969F.
 */
export const CHARGER_TYPE_COLORS: Record<string, string> = {
  '02': '#bfd8d0', // AC완속
  '04': '#a49bc8', // DC콤보
  '06': '#d2b48c', // DC차데모+AC3상+DC콤보
  '11': '#789cb0', // DC콤보2(버스전용)
  '05': '#9eaaa4', // DC차데모+DC콤보
  // 필터에 따라 개별로 표시될 수 있는 나머지 유형: '기타'와 명도가 다른 회청색
  '01': '#5c6068',
  '03': '#d5d7dc',
  '07': '#686c74',
  '08': '#4f535b',
  '09': '#b0b4bb',
  '10': '#787c84',
};
export const CHARGER_TYPE_OTHER = '#92969f'; // 기타 N개 유형
export const chargerTypeColor = (code: string) => CHARGER_TYPE_COLORS[code] ?? CHARGER_TYPE_OTHER;

export const axisTick = { fill: C.muted, fontSize: 14 }; // v4.7: 축 눈금 13 → 14
export const axisLine = { stroke: C.axis };

/** 지각 명도 L*(0~100) → 회색 sRGB 채널 값(0~255) */
function grayFromL(L: number) {
  const y = L > 8 ? ((L + 16) / 116) ** 3 : L / 903.3;
  const c = y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
}
const SEQ_L0 = 20; // 낮은 값: 카드(#222, L* 13)보다 한 단계 밝은 회색
const SEQ_L1 = 96; // 높은 값: 거의 흰색
/**
 * 히트맵용 회색 순차 스케일. 값(t)을 지각 명도 L* 20 → 96에 균등하게 대응시킵니다.
 * 같은 값 차이는 같은 밝기 차이로 보이므로, 낮은 값 구간이 어둡게 뭉치지 않고 대비가 커집니다(순서·비례는 그대로).
 */
export function seqColor(t: number) {
  const x = Math.max(0, Math.min(1, t));
  const v = grayFromL(SEQ_L0 + (SEQ_L1 - SEQ_L0) * x);
  return `rgb(${v},${v},${v})`;
}
/**
 * 순차 스케일 위 텍스트 색: 밝은 칸은 검정에 가까운 글씨, 어두운 칸은 흰 글씨(전환점 L* ≈ 51에서 양쪽 4.2:1 안팎).
 * 열 안에서 가장 낮은 구간(t < 0.1)은 밝은 회색 글씨로 한 단계 물러나게 합니다(#B3B3B3, 칸 배경 위 4.8:1 이상).
 */
export const seqInk = (t: number) => (t > 0.41 ? '#171717' : t < 0.1 ? '#b3b3b3' : '#f5f5f5');
/** 열 안에서 높은 값(t ≥ 0.8)은 숫자를 굵게 */
export const seqWeight = (t: number) => (t >= 0.8 ? 700 : 500);

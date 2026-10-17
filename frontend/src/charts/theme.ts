/** 차트 색상과 공통 축 스타일 (tokens.css와 같은 값) */
export const C = {
  s1: '#a49bc8', // 포인트 — 기본 단일 계열
  s2: '#418f86', // 비교 (세이지 진한 단계, 라벤더와 인접 시 구분 검증)
  s3: '#dbaa5e', // 샌드
  s4: '#bf6f8b', // 로즈
  other: '#566173', // '기타' 묶음, 비강조
  compare: '#81ada8', // UI 비교 강조(선·텍스트 옆 표식)
  point: '#a49bc8',
  dim: '#4a5268', // 선택되지 않은 막대
  grid: '#273042',
  axis: '#364052',
  ink: '#e7eaf0',
  ink2: '#c0c7d2',
  muted: '#8f9cad',
  surface: '#1b2230',
};

export const SERIES = [C.s1, C.s2, C.s3, C.s4];

export const axisTick = { fill: C.muted, fontSize: 12 };
export const axisLine = { stroke: C.axis };

/** 히트맵용 단일 색상(라벤더) 순차 스케일: 0 → 카드에 가까운 색, 1 → 밝은 라벤더 */
export function seqColor(t: number) {
  const a = [0x26, 0x2e, 0x3f];
  const m = [0x6f, 0x68, 0x9a];
  const b = [0xd6, 0xd1, 0xee];
  const x = Math.max(0, Math.min(1, t));
  const [from, to, k] = x < 0.5 ? [a, m, x / 0.5] : [m, b, (x - 0.5) / 0.5];
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/** 순차 스케일 위 텍스트 색 */
export const seqInk = (t: number) => (t > 0.55 ? '#141821' : '#e7eaf0');

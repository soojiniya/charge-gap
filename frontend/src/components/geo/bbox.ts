import type { BBox } from '../../api/types';

/**
 * 지도 화면 영역 → API 요청 bbox.
 * 소수 5자리(약 1m) 격자로 **바깥쪽으로** 맞춥니다: 서·남은 내림, 동·북은 올림.
 * 그래서 요청 범위가 실제 화면을 항상 빠짐없이 감싸고(가장자리 충전소 누락 없음), 화면 밖으로는 최대 0.00001°만 넓어집니다.
 * 같은 화면은 같은 값이 되어 요청 키가 결정적입니다(부동소수점 잔여값은 toFixed로 정리).
 * 이전에는 소수 3자리 반올림이라 화면 안쪽으로 최대 0.0005°(줌 18에서 약 100px)가 빠질 수 있었습니다.
 */
export const BBOX_DECIMALS = 5;
const SCALE = 10 ** BBOX_DECIMALS;
/** 부동소수점 잔여값(예: 126.97800000000001 × 10⁵)을 정수 격자로 보는 허용 오차 */
const EPS = 1e-6;

const down = (v: number) => Number((Math.floor(v * SCALE + EPS) / SCALE).toFixed(BBOX_DECIMALS));
const up = (v: number) => Number((Math.ceil(v * SCALE - EPS) / SCALE).toFixed(BBOX_DECIMALS));

export function coverBBox(west: number, south: number, east: number, north: number): BBox {
  return [
    Math.max(-180, down(west)),
    Math.max(-90, down(south)),
    Math.min(180, up(east)),
    Math.min(90, up(north)),
  ];
}

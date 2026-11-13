/**
 * 이 프로젝트가 쓰는 카카오맵 JavaScript SDK(v2)의 최소 타입.
 * 전체 SDK 타입 패키지를 추가하지 않고, 실제로 호출하는 API만 선언합니다.
 */
export interface KLatLng {
  getLat(): number;
  getLng(): number;
}
export interface KPoint {
  x: number;
  y: number;
}
export interface KLatLngBounds {
  getSouthWest(): KLatLng;
  getNorthEast(): KLatLng;
  extend(latlng: KLatLng): void;
}
export interface KProjection {
  /** 지도 컨테이너 왼쪽 위 기준 화면 좌표(px) */
  containerPointFromCoords(latlng: KLatLng): KPoint;
  coordsFromContainerPoint(point: KPoint): KLatLng;
  /** 현재 레벨의 지도 평면 좌표(px). 묶음 계산처럼 지도 이동과 무관한 좌표가 필요할 때 사용 */
  pointFromCoords(latlng: KLatLng): KPoint;
}
export interface KMouseEvent {
  latLng: KLatLng;
  point?: KPoint;
}
export interface KMap {
  getLevel(): number;
  setLevel(level: number, options?: { animate?: boolean | { duration: number }; anchor?: KLatLng }): void;
  getBounds(): KLatLngBounds;
  setBounds(bounds: KLatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
  getCenter(): KLatLng;
  setCenter(latlng: KLatLng): void;
  panTo(latlng: KLatLng): void;
  getProjection(): KProjection;
  relayout(): void;
  setMinLevel(level: number): void;
  setMaxLevel(level: number): void;
  setCursor?(style: string): void;
}
export interface KakaoMaps {
  Map: new (container: HTMLElement, options: { center: KLatLng; level: number; draggable?: boolean; scrollwheel?: boolean; disableDoubleClickZoom?: boolean }) => KMap;
  LatLng: new (lat: number, lng: number) => KLatLng;
  LatLngBounds: new (sw?: KLatLng, ne?: KLatLng) => KLatLngBounds;
  Point: new (x: number, y: number) => KPoint;
  event: {
    addListener(target: unknown, type: string, handler: (...args: never[]) => void): void;
    removeListener(target: unknown, type: string, handler: (...args: never[]) => void): void;
  };
  load(callback: () => void): void;
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

/** 카카오 지도 레벨(1 = 가장 가까움 … 14 = 가장 멂)과 기존 웹 지도 줌의 대응. 기존 줌 기준(11·16 등)을 그대로 쓰기 위한 환산입니다. */
export const LEVEL_ZOOM_SUM = 20;
export const MIN_LEVEL = 2; // 줌 18
export const MAX_LEVEL = 14; // 줌 6
export const zoomOfLevel = (level: number) => LEVEL_ZOOM_SUM - level;
export const levelOfZoom = (zoom: number) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(LEVEL_ZOOM_SUM - zoom)));

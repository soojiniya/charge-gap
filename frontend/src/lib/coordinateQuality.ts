/* 좌표 품질 안내 문구 (서버 /api/locations 행·격자 station 행의 선택 필드 coordinate_flag).
 * 서버는 원본 좌표 품질이 의심되는 충전소에만 이 필드를 붙입니다(판정 기준: reports/coordinate_quality_2026-11-13.md).
 * 실제 위치 오류로 확정된 것이 아니므로 문구는 "~수 있습니다"로 씁니다. 필드가 없으면 아무것도 표시하지 않습니다. */
import type { CoordinateFlag } from '../api/types';

const NOTICES: Record<CoordinateFlag, string> = {
  placeholder: '원본 좌표가 대략적인 값입니다. 실제 위치와 수 km 차이가 날 수 있습니다.',
  far_from_address: '원본 좌표가 주소지에서 100km 넘게 떨어져 있습니다. 위치가 잘못 표시됐을 수 있습니다.',
  placeholder_far_from_address: '원본 좌표가 주소지와 멀고 대략적인 값입니다. 위치가 잘못 표시됐을 수 있습니다.',
};

/** 안내 문구, 또는 정상 좌표(필드 없음)·알 수 없는 값이면 null. */
export function coordinateNotice(flag: string | null | undefined): string | null {
  return flag != null && Object.prototype.hasOwnProperty.call(NOTICES, flag) ? NOTICES[flag as CoordinateFlag] : null;
}

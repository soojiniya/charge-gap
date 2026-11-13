import type { LocationRow } from '../../api/types';
import { coordinateNotice } from '../../lib/coordinateQuality';

/** 좌표 품질 안내 한 줄(지도 정보창·선택 충전소 패널). 서버가 의심 좌표로 판정한 충전소에만 나타나고,
 *  정상 좌표(coordinate_flag 없음)에는 아무것도 그리지 않습니다. 지도 표시(점 위치·색·모양)는 바꾸지 않습니다. */
export function CoordinateNote({ flag }: { flag: LocationRow['coordinate_flag'] }) {
  const notice = coordinateNotice(flag);
  return notice ? (
    <p className="geo-coord-note" role="note">
      {notice}
    </p>
  ) : null;
}

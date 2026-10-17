import { Icon } from './ui/Icon';

/** 광주·전남 지역 체계 차이 설명 (등록 2025: 29/46 분리, 충전기 2026: 12 통합) */
export function RegionSystemNote({ compact }: { compact?: boolean }) {
  return (
    <div>
      {!compact && (
        <p className="small muted" style={{ marginBottom: 10 }}>
          두 자료는 지역 체계가 다릅니다. 현재 충전기 자료의 12번 지역을 과거 광주·전남으로 나누지 않습니다.
        </p>
      )}
      <div className="regions-pair">
        <div className="region-box">
          <b>전기차 등록 (2025-12)</b>
          17개 시도
          <div className="region-codes">
            <span className="code">29 광주</span>
            <span className="code">46 전남</span>
          </div>
        </div>
        <div className="region-arrow" aria-hidden="true">
          통합
          <br />
          ⟶
        </div>
        <div className="region-box">
          <b>충전기 (2026-10-15)</b>
          16개 시도
          <div className="region-codes">
            <span className="code">12 전남광주통합특별시</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoRatioNotice() {
  return (
    <div className="notice">
      <Icon name="info" />
      <div>
        <strong>등록 대수와 충전기 수는 서로 나누지 않습니다.</strong> 전기차 등록은 2025년 12월, 충전기는 2026년 10월 15일 조회
        자료라 기준 시점과 지역 체계가 다릅니다. 이 대시보드는 충전기 1기당 차량 수나 충전 부족률을 계산하지 않습니다.
      </div>
    </div>
  );
}

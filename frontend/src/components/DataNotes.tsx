import { Icon } from './ui/Icon';

/** 두 자료는 16개 지역으로 대응하지만 기준 시점은 다릅니다. */
export function RegionSystemNote({ compact }: { compact?: boolean }) {
  return (
    <div>
      {!compact && (
        <p className="small muted" style={{ marginBottom: 10 }}>
          <span className="line-block">두 자료는 16개 지역으로 대응합니다. </span>
          <span className="line-block">등록자료의 전남광주를 충전기 자료의 12번 지역에 연결하며 과거 광주·전남으로 나누지 않습니다.</span>
        </p>
      )}
      <div className="regions-pair">
        <div className="region-box">
          <b>전기차 등록 (2026-09)</b>
          16개 시도
          <div className="region-codes">
            <span className="code">12 전남광주 (원본 명칭)</span>
          </div>
        </div>
        <div className="region-arrow" aria-hidden="true">
          대응
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
        <strong>등록 대수와 충전기 수는 서로 나누지 않습니다.</strong> 전기차 등록은 2026년 9월, 충전기는 2026년 10월 15일 조회
        자료라 기준 시점이 다릅니다. 지역 체계는 16개로 대응하지만 이 대시보드는 충전기 1기당 차량 수나 충전 부족률을 계산하지 않습니다.
      </div>
    </div>
  );
}

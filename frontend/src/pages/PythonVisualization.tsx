import { PageHead } from '../components/layout/AppShell';
import { PythonChartGallery } from '../components/ReportGallery';

/** Python Visualization: 처음 Python으로 제작한 원본 그래프 PNG 10개(outputs/charts/ 그대로)를 보여 주는 독립 페이지. 필터와 무관합니다. */
export function PythonVisualizationPage() {
  return (
    <>
      <PageHead
        title="Python Visualization"
        lede="처음 Python(Matplotlib·Seaborn)으로 제작한 원본 그래프 10개를 그대로 보여 줍니다. 전기차 등록 그래프는 2025년 12월 자료 기준이라 다른 페이지(2026년 9월)와 수치가 다릅니다. 그래프를 누르면 크게 보고 데이터 기준·분석 결과·해석 주의를 확인할 수 있습니다."
      >
        {/* 이 페이지의 원본 그래프 기준 시점 (사이트 공통 표시인 2026-09 등록 기준과 다름) */}
        <div className="clock-rail" aria-label="원본 그래프 자료 기준 시점">
          <div className="clock">
            전기차 등록 (원본 01–03)
            <b>2025-12</b>
          </div>
          <div className="clock">
            충전기 조회 (원본 04–08·10)
            <b>2026-10-15 04:16–04:19</b>
          </div>
        </div>
      </PageHead>
      <div className="grid">
        <PythonChartGallery variant="original" />
      </div>
    </>
  );
}

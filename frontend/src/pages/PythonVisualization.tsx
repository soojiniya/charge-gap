import { PageHead } from '../components/layout/AppShell';
import { PythonChartGallery } from '../components/ReportGallery';

/** Python Visualization: Overview에 있던 "Python 데이터 시각화 그래프"(고정 PNG 10개)를 옮긴 독립 페이지. 필터와 무관합니다. */
export function PythonVisualizationPage() {
  return (
    <>
      <PageHead
        title="Python Visualization"
        lede="현재 CHARGE GAP 자료를 Python(Matplotlib·Seaborn)으로 그린 고정 그래프 10개입니다. 그래프를 누르면 크게 보고 데이터 기준·주요 분석 결과·해석 주의를 확인할 수 있습니다."
      />
      <div className="grid">
        <PythonChartGallery />
      </div>
    </>
  );
}

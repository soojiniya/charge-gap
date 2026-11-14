import { PageHead } from '../components/layout/AppShell';
import { PythonChartGallery } from '../components/ReportGallery';

/**
 * Python Visualization: 현재 웹사이트 그래프 1~10을 같은 그래프 종류·자료·집계 기준으로 Matplotlib·Seaborn에서 다시 구현한
 * PNG 10개(public/python-charts-web = outputs/charts_web_matched_2026)를 보여 주는 독립 페이지. 필터와 무관합니다.
 */
export function PythonVisualizationPage() {
  return (
    <>
      <PageHead
        title="Python Visualization"
        lede="현재 웹사이트의 그래프 1~10을 같은 그래프 종류·자료·집계 기준으로 Python(Matplotlib·Seaborn)에서 다시 구현한 그래프 10개입니다. 그래프를 누르면 크게 보고 데이터 출처·기준일·사용 함수·분석 결과·해석 주의를 확인할 수 있습니다."
      />
      <div className="grid">
        <PythonChartGallery variant="web" />
      </div>
    </>
  );
}

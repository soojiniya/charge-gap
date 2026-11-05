import { lazy } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/Overview';

// 지도(Leaflet)가 있는 페이지 등은 처음 열 때 불러옵니다.
const EvRegistrationPage = lazy(() => import('./pages/EvRegistration').then((m) => ({ default: m.EvRegistrationPage })));
const ChargingInfrastructurePage = lazy(() =>
  import('./pages/ChargingInfrastructure').then((m) => ({ default: m.ChargingInfrastructurePage })),
);
const RegionalExplorerPage = lazy(() => import('./pages/RegionalExplorer').then((m) => ({ default: m.RegionalExplorerPage })));
const GrowthTrendsPage = lazy(() => import('./pages/GrowthTrends').then((m) => ({ default: m.GrowthTrendsPage })));
const PythonVisualizationPage = lazy(() => import('./pages/PythonVisualization').then((m) => ({ default: m.PythonVisualizationPage })));

function PageLoading() {
  return (
    <div role="status" className="skeleton" style={{ height: 320, marginTop: 24 }}>
      <span className="sr-only">페이지를 불러오는 중입니다</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="state" style={{ minHeight: '60vh' }}>
      <div className="state-title">찾는 페이지가 없습니다</div>
      <Link to="/" className="btn">
        Overview로 이동
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell fallback={<PageLoading />} />}>
        <Route index element={<OverviewPage />} />
        <Route path="ev-registration" element={<EvRegistrationPage />} />
        <Route path="charging-infrastructure" element={<ChargingInfrastructurePage />} />
        <Route path="regional-explorer" element={<RegionalExplorerPage />} />
        <Route path="growth-trends" element={<GrowthTrendsPage />} />
        <Route path="python-visualization" element={<PythonVisualizationPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

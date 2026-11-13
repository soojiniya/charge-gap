import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { useBaseOverview } from '../../api/hooks';
import { API_BASE_URL, serverReadiness } from '../../api/client';
import { ServerWakeNotice, useServerReadiness } from '../ServerWakeNotice';
import { fmtClock } from '../../lib/format';
import { filterSearch, useFilters, type FilterState } from '../../state/filters';

const NAV: { to: string; label: string; ko: string; icon: IconName }[] = [
  { to: '/', label: 'Overview', ko: '한눈에 보기', icon: 'overview' },
  { to: '/ev-registration', label: 'EV Registration', ko: '전기차 등록', icon: 'car' },
  { to: '/charging-infrastructure', label: 'Charging Infrastructure', ko: '충전 인프라', icon: 'plug' },
  { to: '/regional-explorer', label: 'Regional Explorer', ko: '지역 탐색', icon: 'map' },
  { to: '/growth-trends', label: 'Growth Trends', ko: '설치 추이', icon: 'trend' },
  { to: '/python-visualization', label: 'Python Visualization', ko: 'Python 데이터 시각화', icon: 'image' },
];

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 36 36" aria-hidden="true">
      <rect x="0.5" y="0.5" width="35" height="35" rx="10" fill="#222222" stroke="#383838" />
      {/* a bolt split by a gap — 단색(무채색) */}
      <path d="M20.5 6 11 19.5h6.2" fill="none" stroke="#f5f5f5" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.2 16.5h6L15.5 30" fill="none" stroke="#a3a3a3" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const base = useBaseOverview();
  // 페이지를 옮겨도 공통 필터(지역·유형·삭제 표시·운영기관·등록 지역)를 유지합니다.
  const search = filterSearch(useLocation().search);
  const wake = useServerReadiness();
  const src = base.data?.meta.sources;
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="주 메뉴">
      <NavLink to={{ pathname: '/', search }} className="brand" onClick={onNavigate}>
        <BrandMark />
        <span>
          <span className="brand-name">CHARGE GAP</span>
          <span className="brand-sub">전기차 보급과 충전 인프라 현황</span>
        </span>
      </NavLink>
      <nav className="nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={{ pathname: n.to, search }} end={n.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onNavigate}>
            <Icon name={n.icon} />
            <span>
              {n.label}
              <span className="nav-ko">{n.ko}</span>
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot" aria-live="polite">
        <div>
          <span className={`api-dot ${base.isSuccess && wake.phase === 'ready' ? 'ok' : base.isError || wake.phase === 'unavailable' ? 'err' : ''}`} />
          <strong>
            {wake.phase === 'waking'
              ? '서버 준비 중'
              : wake.phase === 'unavailable'
                ? 'API 연결 실패'
                : base.isSuccess
                  ? 'API 연결됨'
                  : base.isError
                    ? 'API 연결 실패'
                    : 'API 확인 중'}
          </strong>
        </div>
        <div className="num" style={{ wordBreak: 'break-all' }}>{API_BASE_URL}</div>
        {src?.chargers && (
          <div style={{ marginTop: 6 }}>
            충전기 스냅샷 {src.chargers.snapshot_date} {fmtClock(src.chargers.snapshot_start_at)}–{fmtClock(src.chargers.snapshot_end_at)} KST
          </div>
        )}
        {(base.isError || wake.phase === 'unavailable') && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => (wake.phase === 'unavailable' ? serverReadiness.checkNow() : base.refetch())}
          >
            <Icon name="refresh" /> 다시 연결
          </button>
        )}
      </div>
    </aside>
  );
}

export function AppShell({ fallback }: { fallback?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // 잘못된 URL 필터 값(예: ?region=99)은 화면에서 무시하고, 기록을 늘리지 않도록 URL에서도 지웁니다.
  const { invalid, update } = useFilters();
  const invalidKeys = invalid.join(',');
  useEffect(() => {
    if (!invalidKeys) return;
    update(Object.fromEntries(invalidKeys.split(',').map((key) => [key, undefined])) as Partial<FilterState>);
  }, [invalidKeys, update]);
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <>
      <a href="#main" className="skip-link">
        본문으로 건너뛰기
      </a>
      <div className="shell">
        <Sidebar open={open} onNavigate={() => setOpen(false)} />
        {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
        <div style={{ minWidth: 0 }}>
          <div className="mobile-bar">
            <button type="button" className="icon-btn" aria-label="메뉴 열기" aria-expanded={open} onClick={() => setOpen(true)}>
              <Icon name="menu" />
            </button>
            <span className="brand-name">CHARGE GAP</span>
          </div>
          <main id="main" className="main" tabIndex={-1}>
            <ServerWakeNotice />
            <Suspense fallback={fallback}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </>
  );
}

/** 페이지 제목 + 두 자료의 기준 시점 레일 (모든 페이지 상단) */
export function PageHead({ title, lede, children }: { title: string; lede: ReactNode; children?: ReactNode }) {
  const base = useBaseOverview();
  const src = base.data?.meta.sources;
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-lede">{lede}</p>
      </div>
      {children ?? (
        <div className="clock-rail" aria-label="자료 기준 시점">
          <div className="clock">
            전기차 등록
            <b>{src?.ev_registration?.reference_month ?? '—'}</b>
          </div>
          <div className="clock">
            충전기 조회
            <b>
              {src?.chargers?.snapshot_date ?? '—'}{' '}
              {src?.chargers ? `${fmtClock(src.chargers.snapshot_start_at)}–${fmtClock(src.chargers.snapshot_end_at)}` : ''}
            </b>
          </div>
        </div>
      )}
    </header>
  );
}

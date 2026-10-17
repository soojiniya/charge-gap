import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { useBaseOverview } from '../../api/hooks';
import { API_BASE_URL } from '../../api/client';
import { fmtClock } from '../../lib/format';

const NAV: { to: string; label: string; ko: string; icon: IconName }[] = [
  { to: '/', label: 'Overview', ko: '한눈에 보기', icon: 'overview' },
  { to: '/ev-registration', label: 'EV Registration', ko: '전기차 등록', icon: 'car' },
  { to: '/charging-infrastructure', label: 'Charging Infrastructure', ko: '충전 인프라', icon: 'plug' },
  { to: '/regional-explorer', label: 'Regional Explorer', ko: '지역 탐색', icon: 'map' },
  { to: '/growth-trends', label: 'Growth Trends', ko: '설치 추이', icon: 'trend' },
];

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 36 36" aria-hidden="true">
      <defs>
        <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9c3e3" />
          <stop offset="1" stopColor="#81ada8" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="35" height="35" rx="10" fill="#1b2230" stroke="rgba(255,255,255,.1)" />
      {/* a bolt split by a gap */}
      <path d="M20.5 6 11 19.5h6.2" fill="none" stroke="url(#bm)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.2 16.5h6L15.5 30" fill="none" stroke="url(#bm)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const base = useBaseOverview();
  const src = base.data?.meta.sources;
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="주 메뉴">
      <NavLink to="/" className="brand" onClick={onNavigate}>
        <BrandMark />
        <span>
          <span className="brand-name">CHARGE GAP</span>
          <span className="brand-sub">전기차 보급과 충전 인프라 현황</span>
        </span>
      </NavLink>
      <nav className="nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onNavigate}>
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
          <span className={`api-dot ${base.isSuccess ? 'ok' : base.isError ? 'err' : ''}`} />
          <strong>{base.isSuccess ? 'API 연결됨' : base.isError ? 'API 연결 실패' : 'API 확인 중'}</strong>
        </div>
        <div className="num" style={{ wordBreak: 'break-all' }}>{API_BASE_URL}</div>
        {src?.chargers && (
          <div style={{ marginTop: 6 }}>
            충전기 스냅샷 {src.chargers.snapshot_date} {fmtClock(src.chargers.snapshot_start_at)}–{fmtClock(src.chargers.snapshot_end_at)} KST
          </div>
        )}
        {base.isError && (
          <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => base.refetch()}>
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

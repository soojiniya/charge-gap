import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 주소 hash가 `#id`일 때, 그 섹션의 데이터가 준비된 뒤 한 번 그 위치로 스크롤합니다.
 * - 같은 주소 항목(location.key)마다 한 번만: 뒤로/앞으로 가기·새로고침·직접 접속에서도 다시 이동합니다.
 * - 위쪽 카드(지도·비교 등)가 늦게 그려져 위치가 밀리면 잠시(약 1.5초) 위치를 다시 맞춥니다.
 *   그동안 사용자가 휠·터치·키보드·마우스로 직접 움직이면 즉시 멈춥니다.
 * - 화면 위에 고정된 막대(데스크톱 필터 막대·모바일 메뉴 막대)에 가리지 않도록 그만큼 띄웁니다.
 * - hash가 없으면(메뉴로 연 경우) 아무것도 하지 않아 기존처럼 맨 위부터 보입니다.
 */
export function useHashScroll(id: string, ready: boolean) {
  const { hash, key } = useLocation();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (hash !== `#${id}` || !ready || done.current === key) return;
    done.current = key;
    let stopped = false;
    let raf = 0;
    const stop = () => {
      stopped = true;
    };
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    const targetTop = () => {
      const el = document.getElementById(id);
      if (!el) return null;
      // 화면 위에 붙는 막대(데스크톱 필터 막대, 모바일 상단 메뉴 막대) 중 가장 아래 끝만큼 띄웁니다.
      const covered = Math.max(
        0,
        ...[...document.querySelectorAll<HTMLElement>('.filterbar, .mobile-bar')].map((bar) => {
          const cs = getComputedStyle(bar);
          if (cs.display === 'none' || (cs.position !== 'sticky' && cs.position !== 'fixed')) return 0;
          return (parseFloat(cs.top) || 0) + bar.getBoundingClientRect().height;
        }),
      );
      return Math.max(0, el.getBoundingClientRect().top + window.scrollY - covered - 12);
    };
    const go = () => {
      const top = targetTop();
      if (top != null && Math.abs(window.scrollY - top) > 2) window.scrollTo({ top, behavior: 'auto' });
    };
    const start = performance.now();
    const tick = () => {
      if (stopped) return;
      go();
      if (performance.now() - start < 1500) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
  }, [hash, key, id, ready]);
}

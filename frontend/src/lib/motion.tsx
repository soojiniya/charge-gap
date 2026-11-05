/**
 * 차트 모션 공통 규칙 (새 라이브러리 없이 Recharts 내장 애니메이션 + CSS + requestAnimationFrame).
 *  - 첫 등장 400~650ms, 호버 120~200ms, 필터 변경 시 값 전환 ~450ms
 *  - 카드가 화면에 처음 들어올 때 한 번만 재생하고, 스크롤로 다시 들어와도 반복하지 않음
 *  - prefers-reduced-motion: reduce 이면 모든 모션을 끄고 최종 상태를 바로 표시
 *  - 툴팁·축·표는 항상 실제 API 값을 사용하고, 보간된 값은 그리기에만 사용
 */
import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export const MOTION = {
  /** 첫 등장 */
  enter: 520,
  /** 필터 변경 시 값 전환 */
  update: 450,
  /** 호버 (CSS 변수 --hover와 동일) */
  hover: 160,
  /** 순차 등장 간격 */
  stagger: 22,
  easing: 'ease-out' as const,
};

const query = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

interface MotionState {
  /** 이 차트에 애니메이션을 써도 되는지 (화면에 들어왔고, 모션 감소 설정이 아님) */
  animate: boolean;
  reduced: boolean;
}
const MotionCtx = createContext<MotionState>({ animate: false, reduced: false });

export function useMotion() {
  return useContext(MotionCtx);
}

/**
 * 카드 본문이 처음 뷰포트에 들어오는 순간 한 번만 차트를 다시 마운트해 등장 애니메이션을 재생합니다.
 * 그 전에는 같은 크기로 렌더링하되 보이지 않게 두어(레이아웃 이동 없음) 화면 밖에서 애니메이션이 소모되지 않게 합니다.
 */
export function Reveal({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(() => !enabled || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (seen || !ref.current) return;
    // 12% 이상 보이면 등장. 화면보다 훨씬 긴 카드(모바일 격차 분석 등)는 12%에 못 미쳐도
    // 화면 높이의 1/4 이상이 보이면 등장시킵니다(주소 #앵커로 바로 이동했을 때 빈 카드로 남지 않도록).
    const io = new IntersectionObserver(
      (entries) => {
        const shown = entries.some(
          (e) => e.isIntersecting && (e.intersectionRatio >= 0.12 || (e.rootBounds != null && e.intersectionRect.height >= e.rootBounds.height * 0.25)),
        );
        if (shown) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: [0, 0.03, 0.06, 0.09, 0.12] },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);

  const visible = seen || reduced;
  return (
    <div ref={ref} className={`reveal ${visible ? 'is-visible' : ''}`}>
      <MotionCtx.Provider value={{ animate: enabled && seen && !reduced, reduced }}>
        <Fragment key={seen ? 'seen' : 'pre'}>{children}</Fragment>
      </MotionCtx.Provider>
    </div>
  );
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * 숫자 맵을 이전 표시값에서 새 목표값으로 보간합니다 (커스텀 SVG 차트의 필터 전환용).
 * 처음 마운트할 때는 목표값을 그대로 반환합니다.
 */
export function useTweenedMap(target: Record<string, number>, duration = MOTION.update, enabled = true) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const sig = JSON.stringify(target);

  useEffect(() => {
    if (!enabled) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const k = easeOutCubic(t);
      const next: Record<string, number> = {};
      for (const key of Object.keys(target)) {
        const a = from[key];
        const b = target[key];
        next[key] = a === undefined || !Number.isFinite(a) ? b : a + (b - a) * k;
      }
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, enabled, duration]);

  return shown;
}

/**
 * KPI 카운트업: 처음에는 0에서, 이후 필터 변경 시에는 이전 값에서 목표값까지 짧게 증가합니다.
 * 표시값은 항상 정수로 반올림하고, 끝나면 정확히 목표값에 멈춥니다.
 */
export function useCountUp(target: number | null | undefined, animate: boolean, duration = 600) {
  const [value, setValue] = useState<number | null>(animate ? 0 : target ?? null);
  const valueRef = useRef<number>(animate ? 0 : target ?? 0);

  useEffect(() => {
    if (target === null || target === undefined) return;
    if (!animate) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    const from = valueRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = t >= 1 ? target : Math.round(from + (target - from) * easeOutCubic(t));
      valueRef.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, animate, duration]);

  return value;
}

/** KPI 숫자 카운트업 표시. 화면 읽기 프로그램에는 최종 실제 값을 바로 제공합니다. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const { animate } = useMotion();
  const shown = useCountUp(value, animate, 600);
  return (
    <>
      <span aria-hidden="true">{format(shown ?? value)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

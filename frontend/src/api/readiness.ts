/**
 * 서버 준비 대기 (Render 무료 플랜 절전 복귀).
 *
 * API 요청이 연결 실패나 JSON이 아닌 응답(깨어나는 중 안내 페이지 등)으로 끝나면, 요청마다 오류를
 * 보여 주거나 따로 재시도하지 않고 이 대기열에 들어갑니다. 대기 중에는 가벼운 상태 확인 요청 하나만
 * 간격을 두고(2·4·8초 뒤, 이후 10초마다) 최대 3분 동안 보냅니다. 서버가 응답하면 기다리던 요청이
 * 각자 한 번 다시 요청하고, 3분이 지나면 'unavailable'로 바뀌어 수동 재시도를 안내합니다.
 * 400·404 같은 API 오류(JSON 응답)는 서버가 깨어 있다는 뜻이므로 여기로 오지 않습니다.
 */
export type WakePhase = 'ready' | 'waking' | 'unavailable';

export interface WakeSnapshot {
  phase: WakePhase;
  /** 현재(또는 마지막) 대기를 시작한 시각(ms). ready로 시작한 뒤 한 번도 기다리지 않았으면 null */
  startedAt: number | null;
  /** 이번 대기에서 보낸 상태 확인 요청 수 */
  checks: number;
}

export interface ReadinessTiming {
  /** 첫 확인들 사이의 대기(ms) */
  delays: number[];
  /** 그 뒤 확인 간격(ms) */
  interval: number;
  /** 최대 대기 시간(ms) */
  maxWait: number;
  /** 확인 요청 하나의 최대 시간(ms). 응답을 붙잡아 두는 프록시에서도 다음 확인으로 넘어가게 합니다 */
  probeTimeout: number;
}

export const DEFAULT_TIMING: ReadinessTiming = { delays: [2000, 4000, 8000], interval: 10000, maxWait: 180000, probeTimeout: 15000 };

export class WakeTimeoutError extends Error {
  constructor() {
    super('server did not become ready in time');
    this.name = 'WakeTimeoutError';
  }
}

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}

/** probe: 서버(앱)가 응답하면 true. 네트워크 실패·준비 중 페이지면 false */
export function createReadiness(probe: (signal: AbortSignal) => Promise<boolean>, timing: ReadinessTiming = DEFAULT_TIMING) {
  let config = { ...timing };
  let snapshot: WakeSnapshot = { phase: 'ready', startedAt: null, checks: 0 };
  const listeners = new Set<() => void>();
  const readyListeners = new Set<() => void>();
  const waiters = new Set<Waiter>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | null = null;
  let generation = 0;

  const set = (next: Partial<WakeSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };

  const settle = (ok: boolean) => {
    const pending = [...waiters];
    waiters.clear();
    pending.forEach((w) => {
      w.cleanup();
      if (ok) w.resolve();
      else w.reject(new WakeTimeoutError());
    });
  };

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    inFlight?.abort();
    inFlight = null;
  };

  const schedule = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void check(), Math.max(0, delay));
  };

  async function check() {
    if (snapshot.phase !== 'waking' || inFlight) return;
    const run = generation;
    const controller = new AbortController();
    inFlight = controller;
    const limit = setTimeout(() => controller.abort(), config.probeTimeout);
    set({ checks: snapshot.checks + 1 });
    let ok = false;
    try {
      ok = await probe(controller.signal);
    } catch {
      ok = false;
    } finally {
      clearTimeout(limit);
      if (inFlight === controller) inFlight = null;
    }
    if (run !== generation || snapshot.phase !== 'waking') return;
    if (ok) {
      stop();
      set({ phase: 'ready' });
      settle(true);
      readyListeners.forEach((listener) => listener());
      return;
    }
    const elapsed = Date.now() - (snapshot.startedAt ?? Date.now());
    if (elapsed >= config.maxWait) {
      stop();
      set({ phase: 'unavailable' });
      settle(false);
      return;
    }
    // 첫 확인은 delays[0] 뒤, 이후 delays[1], delays[2] ... 다음부터는 interval 간격
    const next = snapshot.checks < config.delays.length ? config.delays[snapshot.checks] : config.interval;
    schedule(Math.min(next, config.maxWait - elapsed));
  }

  const start = (immediate: boolean) => {
    stop();
    generation += 1;
    set({ phase: 'waking', startedAt: Date.now(), checks: 0 });
    if (immediate) void check();
    else schedule(config.delays[0] ?? config.interval);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** 서버가 다시 준비되면 한 번씩 호출됩니다(예: 오류로 끝난 쿼리 다시 요청) */
    onReady(listener: () => void) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    /**
     * 서버가 준비될 때까지 기다립니다. 대기 중이 아니면 새 대기를 시작합니다(이미 대기 중이면 합류).
     * signal이 중단되면 AbortError, 최대 대기 시간이 지나면 WakeTimeoutError로 끝납니다.
     */
    waitUntilReady(signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) return Promise.reject(abortError());
      if (snapshot.phase !== 'waking') start(false);
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          if (waiters.delete(waiter)) reject(abortError());
        };
        const waiter: Waiter = { resolve, reject, cleanup: () => signal?.removeEventListener('abort', onAbort) };
        waiters.add(waiter);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
    /** 사용자가 누른 '지금 다시 확인'·'다시 시도': 대기 중이면 즉시 확인, 실패 상태면 새 3분 대기를 즉시 시작 */
    checkNow() {
      if (snapshot.phase === 'waking') {
        clearTimeout(timer);
        void check();
      } else if (snapshot.phase === 'unavailable') {
        start(true);
      }
    },
    /** 테스트용: 간격 조정과 초기화 */
    configure(next: Partial<ReadinessTiming>) {
      config = { ...config, ...next };
    },
    reset() {
      stop();
      generation += 1;
      settle(false);
      snapshot = { phase: 'ready', startedAt: null, checks: 0 };
      listeners.forEach((listener) => listener());
    },
    get waiting() {
      return waiters.size;
    },
  };
}

export type Readiness = ReturnType<typeof createReadiness>;

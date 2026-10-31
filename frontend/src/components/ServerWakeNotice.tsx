import { useEffect, useState, useSyncExternalStore } from 'react';
import { serverReadiness } from '../api/client';
import { Icon } from './ui/Icon';

export function useServerReadiness() {
  return useSyncExternalStore(serverReadiness.subscribe, serverReadiness.getSnapshot, serverReadiness.getSnapshot);
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * 서버 절전 복귀 통합 안내. 대기 중에는 그래프 카드가 기존 로딩 모양을 유지하고 이 안내 하나만 보입니다.
 * 3분이 지나면 경고로 바뀌어 수동 재시도를 제공합니다. 서버가 준비되면 사라집니다.
 */
export function ServerWakeNotice() {
  const { phase, startedAt } = useServerReadiness();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== 'waking') return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  if (phase === 'ready') return null;
  const local = import.meta.env.DEV ? ' (로컬 개발: backend 폴더에서 run.py로 Flask 서버를 실행했는지 확인하세요.)' : '';
  const waking = phase === 'waking';
  return (
    <div
      className={`notice ${waking ? '' : 'warn'}`}
      role={waking ? 'status' : 'alert'}
      aria-live={waking ? 'polite' : 'assertive'}
      data-server-wake={phase}
      style={{ marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}
    >
      <Icon name={waking ? 'info' : 'alert'} />
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        {waking ? (
          <>
            <strong>데이터 서버를 준비하는 중입니다.</strong> 무료 서버가 절전 상태에서 깨어나고 있어 보통 1~2분 걸립니다. 준비되면 지금 화면과
            필터 그대로 데이터가 자동으로 표시됩니다.{local}{' '}
            <span className="num" style={{ whiteSpace: 'nowrap' }} aria-label="경과 시간">
              경과 {clock(now - (startedAt ?? now))}
            </span>
          </>
        ) : (
          <>
            <strong>데이터 서버가 3분 동안 응답하지 않았습니다.</strong> 잠시 후 다시 시도해 주세요. 계속 응답하지 않으면 서버 상태를 확인해야
            합니다.{local}
          </>
        )}
      </div>
      <button type="button" className="btn btn-sm" onClick={() => serverReadiness.checkNow()}>
        <Icon name="refresh" /> {waking ? '지금 다시 확인' : '다시 시도'}
      </button>
    </div>
  );
}

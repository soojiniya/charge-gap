import type { ReactNode } from 'react';
import { ApiError, WAKE_TIMEOUT_CODE, serverReadiness } from '../../api/client';
import { Icon } from './Icon';

interface Props {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDetail?: ReactNode;
  height?: number;
  children: ReactNode;
}

/** 로딩 · 오류 · 빈 결과 상태를 일관되게 보여주는 래퍼 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  emptyTitle = '조건에 맞는 데이터가 없습니다',
  emptyDetail = '필터를 바꾸거나 초기화해 보세요.',
  height = 220,
  children,
}: Props) {
  if (isLoading) {
    return (
      <div role="status" aria-live="polite" style={{ height }} className="skeleton-chart">
        {/* 차트 모양의 자리 표시: 막대 길이는 장식이며 데이터가 아닙니다 */}
        {[78, 56, 64, 38, 47].map((w, i) => (
          <span key={i} className="skeleton skeleton-bar" style={{ width: `${w}%` }} aria-hidden="true" />
        ))}
        <span className="sr-only">데이터를 불러오는 중입니다</span>
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={onRetry} height={height} />;
  if (isEmpty) {
    return (
      <div className="state" style={{ minHeight: height }}>
        <Icon name="empty" />
        <div className="state-title">{emptyTitle}</div>
        <div className="state-detail">{emptyDetail}</div>
      </div>
    );
  }
  return <>{children}</>;
}

export function ErrorState({ error, onRetry, height = 220 }: { error: unknown; onRetry?: () => void; height?: number }) {
  const apiErr = error instanceof ApiError ? error : null;
  // 서버 절전 복귀 대기 시간 초과: 카드마다 빨간 오류를 띄우지 않고, 화면 위 통합 안내와 같은 재시도를 연결합니다.
  if (apiErr && apiErr.code === WAKE_TIMEOUT_CODE) {
    return (
      <div className="state" role="status" style={{ minHeight: height }}>
        <Icon name="info" />
        <div className="state-title">데이터 서버가 아직 응답하지 않습니다</div>
        <div className="state-detail">화면 위 안내에서 다시 시도하거나 아래 버튼을 눌러 주세요.</div>
        <button type="button" className="btn btn-sm" onClick={() => serverReadiness.checkNow()}>
          <Icon name="refresh" /> 다시 시도
        </button>
      </div>
    );
  }
  // 연결 실패·서버 준비 중(JSON이 아닌 응답)은 같은 안내로 묶고, 기술 코드는 표시하지 않습니다.
  const unreachable = !!apiErr && (apiErr.isNetwork || apiErr.code === 'SERVER_UNAVAILABLE');
  const title = unreachable
    ? 'API 서버에 연결하지 못했습니다'
    : apiErr?.status === 400
      ? '요청변수가 허용되지 않습니다'
      : '데이터를 불러오지 못했습니다';
  return (
    <div className="state error" role="alert" style={{ minHeight: height }}>
      <Icon name="alert" />
      <div className="state-title">{title}</div>
      <div className="state-detail">
        {apiErr ? apiErr.message : String((error as Error)?.message ?? error)}
        {apiErr && !unreachable && (
          <>
            <br />
            <span className="num">
              {apiErr.status} {apiErr.code}
              {apiErr.parameter ? ` (${apiErr.parameter})` : ''}
            </span>
          </>
        )}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          <Icon name="refresh" /> 다시 요청
        </button>
      )}
    </div>
  );
}

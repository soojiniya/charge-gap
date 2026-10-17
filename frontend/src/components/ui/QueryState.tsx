import type { ReactNode } from 'react';
import { ApiError } from '../../api/client';
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
  const title = apiErr?.isNetwork
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
        {apiErr && !apiErr.isNetwork && (
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

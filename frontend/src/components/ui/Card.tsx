import { useState, type ReactNode } from 'react';
import type { BaseMeta } from '../../api/types';
import { Icon } from './Icon';
import { ChartDetail } from './ChartDetail';
import { Reveal } from '../../lib/motion';

export type Scope = { kind: 'filtered'; label?: string } | { kind: 'fixed'; label?: string };

interface CardProps {
  title: ReactNode;
  sub?: ReactNode;
  scope?: Scope;
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  isFetching?: boolean;
  actions?: ReactNode;
  foot?: ReactNode;
  className?: string;
  children: ReactNode;
  /** 보고서·과제용 그래프 번호 (1~10) */
  no?: number;
  /** 그래프 아래 분석 문단 (Insight) */
  insight?: ReactNode;
  /** 처음 화면에 들어올 때 한 번 등장 애니메이션 (지도처럼 다시 마운트하면 안 되는 카드는 false) */
  reveal?: boolean;
  /** 백엔드 집계가 준비되지 않은 미완료 그래프 */
  pending?: boolean;
  /** 상세 보기: 확대 차트·데이터 표·출처·보존된 보고서 PNG */
  detail?: {
    chart?: ReactNode;
    table?: ReactNode;
    meta?: BaseMeta;
    staticChartIds?: number[];
    note?: ReactNode;
    insight?: ReactNode;
  };
}

export function ScopeTag({ scope }: { scope: Scope }) {
  return (
    <span
      className={`scope ${scope.kind === 'filtered' ? 'on' : ''}`}
      title={scope.kind === 'filtered' ? '선택한 필터로 다시 요청되는 차트' : '선택한 필터와 무관한 차트'}
    >
      {scope.label ?? (scope.kind === 'filtered' ? '필터 적용' : '필터 무관')}
    </span>
  );
}

export function Card({ title, sub, scope, span, isFetching, actions, foot, className, children, detail, no, insight, pending, reveal = true }: CardProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`card ${span ? `span-${span}` : ''} ${pending ? 'pending' : ''} ${className ?? ''}`} aria-busy={isFetching || undefined}>
      {isFetching && <div className="refetching" aria-hidden="true" />}
      <header className="card-head">
        <div>
          <h2 className="card-title">
            {no !== undefined && <span className="chart-no">그래프 {no}</span>}
            {title}
          </h2>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
        <div className="card-actions">
          {pending && <span className="pending-badge">미완료: 백엔드 집계 필요</span>}
          {scope && <ScopeTag scope={scope} />}
          {actions}
          {detail && (
            <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label={`${typeof title === 'string' ? title : '차트'} 상세 보기`} title="상세 보기">
              <Icon name="expand" />
            </button>
          )}
        </div>
      </header>
      <div className="card-body">
        <Reveal enabled={reveal}>{children}</Reveal>
      </div>
      {insight}
      {foot && <footer className="card-foot">{foot}</footer>}
      {open && detail && (
        <ChartDetail title={title} sub={sub} detail={{ ...detail, insight: detail.insight ?? insight }} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}

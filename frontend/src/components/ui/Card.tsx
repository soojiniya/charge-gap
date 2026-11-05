import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BaseMeta } from '../../api/types';
import { Icon } from './Icon';
import { ChartDetail } from './ChartDetail';
import { Reveal } from '../../lib/motion';
import { InsightContext } from './Insight';

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
  // 그래프 설명(i) 버튼: 카드 아래 Insight의 설명 패널을 머리글에서도 엽니다(그래프를 가리지 않는 오른쪽 패널).
  const openInfo = useRef<(() => void) | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const onInfoOpenChange = useCallback((v: boolean) => setInfoOpen(v), []);
  const insightCtx = useMemo(() => ({ title, no, openRef: openInfo, onOpenChange: onInfoOpenChange }), [title, no, onInfoOpenChange]);
  const titleText = typeof title === 'string' ? title : '그래프';
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
          {insight && (
            <button
              type="button"
              className="icon-btn"
              data-info-toggle
              aria-haspopup="dialog"
              aria-expanded={infoOpen}
              onClick={() => openInfo.current?.()}
              aria-label={`${titleText} 그래프 설명: 데이터 출처, 기준일, 계산 방법, 주요 결과, 주의사항`}
              title="그래프 설명 (출처·기준일·계산 방법·주의사항)"
            >
              <Icon name="info" />
            </button>
          )}
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
      {insight && <InsightContext.Provider value={insightCtx}>{insight}</InsightContext.Provider>}
      {foot && <footer className="card-foot">{foot}</footer>}
      {open && detail && (
        <ChartDetail title={title} sub={sub} detail={{ ...detail, insight: detail.insight ?? insight }} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}

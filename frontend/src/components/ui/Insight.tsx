import type { ReactNode } from 'react';

export interface InsightProps {
  /** dynamic: 현재 필터 결과로 다시 계산 / fixed: 전국 기준 고정 분석 */
  mode: 'dynamic' | 'fixed';
  modeNote?: string;
  purpose: ReactNode;
  reason: ReactNode;
  findings: ReactNode[];
  interpretation: ReactNode;
  caution: ReactNode;
  source: ReactNode;
  variables: string[];
  /** (이전 버전 호환용) 좁은 카드 여부. 현재는 항상 한 줄 흐름으로 배치합니다. */
  stack?: boolean;
}

/**
 * 그래프 아래 분석 영역.
 * 1) 주요 분석 결과(가장 먼저, 강조 상자) → 2) 해석 → 3) 접을 수 있는 분석 근거(목적·선택 이유·주의사항·출처·변수).
 * 주요 결과와 해석은 각 그래프가 받은 실제 API 응답으로 계산한 문장입니다.
 */
export function Insight({ mode, modeNote, purpose, reason, findings, interpretation, caution, source, variables }: InsightProps) {
  return (
    <div className="insight">
      <section className="insight-key" aria-label="주요 분석 결과">
        <header className="insight-key-head">
          <h3>주요 분석 결과</h3>
          <span className={`insight-mode ${mode === 'dynamic' ? 'dynamic' : ''}`}>
            {modeNote ?? (mode === 'dynamic' ? '현재 필터 결과로 계산' : '전국 기준 고정 분석')}
          </span>
        </header>
        {findings.length ? (
          <ul>
            {findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">표시할 결과가 없습니다.</p>
        )}
      </section>

      <div className="insight-interp">
        <h3>해석</h3>
        <p>{interpretation}</p>
      </div>

      <details className="insight-more">
        <summary>분석 근거 보기: 분석 목적, 그래프 선택 이유, 주의사항, 데이터 출처</summary>
        <dl className="insight-meta">
          <dt>분석 목적</dt>
          <dd>{purpose}</dd>
          <dt>그래프 선택 이유</dt>
          <dd>{reason}</dd>
          <dt>주의사항</dt>
          <dd>{caution}</dd>
          <dt>데이터 출처</dt>
          <dd>{source}</dd>
          <dt>사용 변수</dt>
          <dd>
            {variables.map((v, i) => (
              <span key={v}>
                <code>{v}</code>
                {i < variables.length - 1 ? ', ' : ''}
              </span>
            ))}
          </dd>
        </dl>
      </details>
    </div>
  );
}

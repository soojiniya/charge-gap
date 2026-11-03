import { createContext, useContext, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Icon, type IconName } from './Icon';
import { parseSource } from '../../analysis/sourceParts';
import { SentenceLines } from '../../lib/sentences';

/**
 * Card가 제공하는 정보: 분석 근거 패널 제목에 그래프 번호·제목을 표시합니다.
 * inline: 차트 확대 창 안에서는 패널을 겹쳐 열지 않고 분석 근거를 바로 펼쳐 보여 줍니다.
 */
export const InsightContext = createContext<{ title?: ReactNode; no?: number; inline?: boolean }>({});

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
 * 1) 주요 분석 결과(가장 먼저, 강조 상자) → 2) 해석 → 3) 분석 근거(목적·선택 이유·주의사항·출처·변수).
 * 분석 근거는 카드 안에서 펼치지 않고 오른쪽 상세 패널로 엽니다. 카드 높이와 같은 행의 다른 카드가 흔들리지 않습니다.
 * 주요 결과와 해석은 각 그래프가 받은 실제 API 응답으로 계산한 문장입니다.
 */
export function Insight({ mode, modeNote, purpose, reason, findings, interpretation, caution, source, variables }: InsightProps) {
  const { title, no, inline } = useContext(InsightContext);
  const [open, setOpen] = useState(false);
  const basis = modeNote ?? (mode === 'dynamic' ? '현재 필터 결과로 계산' : '전국 기준 고정 분석');
  const evidence = { purpose, reason, caution, source, variables };
  return (
    <div className="insight">
      <section className="insight-key" aria-label="주요 분석 결과">
        <header className="insight-key-head">
          <h3>주요 분석 결과</h3>
          <span className={`insight-mode ${mode === 'dynamic' ? 'dynamic' : ''}`}>
            {basis}
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
        <p>
          <SentenceLines>{interpretation}</SentenceLines>
        </p>
      </div>

      {inline ? (
        <section className="insight-more is-inline" aria-label="분석 근거">
          <h3>분석 근거</h3>
          <EvidenceBody {...evidence} level={4} />
        </section>
      ) : (
        <div className="insight-more">
          <button
            type="button"
            className="evidence-btn"
            data-evidence-toggle
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="info" />
            <span>
              분석 근거 보기<span className="evidence-btn-detail">: 분석 목적, 그래프 선택 이유, 주의사항, 데이터 출처</span>
            </span>
          </button>
        </div>
      )}
      {open && (
        <Modal
          variant="panel"
          eyebrow={
            <>
              <span>분석 근거</span>
              {no !== undefined && <span className="evidence-no">그래프 {String(no).padStart(2, '0')}</span>}
            </>
          }
          title={title ?? '그래프'}
          subtitle={<span className={`evidence-basis ${mode === 'dynamic' ? 'dynamic' : ''}`}>{basis}</span>}
          onClose={() => setOpen(false)}
        >
          <EvidenceBody {...evidence} level={3} />
        </Modal>
      )}
    </div>
  );
}

interface EvidenceProps {
  purpose: ReactNode;
  reason: ReactNode;
  caution: ReactNode;
  source: ReactNode;
  variables: string[];
  /** 섹션 제목 수준: 패널은 h3(패널 제목 h2 아래), 차트 확대 창 안은 h4('분석 근거' h3 아래) */
  level: 3 | 4;
}

function SectionTitle({ icon, level, children }: { icon: IconName; level: 3 | 4; children: ReactNode }) {
  const H = level === 3 ? 'h3' : 'h4';
  return (
    <H className="evidence-title">
      <Icon name={icon} />
      {children}
    </H>
  );
}

/** 분석 근거 본문: 오른쪽 패널과 차트 확대 창에서 같은 디자인을 씁니다. 원문은 그대로 표시합니다. */
function EvidenceBody({ purpose, reason, caution, source, variables, level }: EvidenceProps) {
  const src = typeof source === 'string' ? parseSource(source) : null;
  return (
    <div className="evidence">
      <section className="evidence-section">
        <SectionTitle icon="target" level={level}>
          분석 목적
        </SectionTitle>
        <p className="evidence-text">{purpose}</p>
      </section>
      <section className="evidence-section">
        <SectionTitle icon="chart" level={level}>
          그래프 선택 이유
        </SectionTitle>
        <p className="evidence-text">{reason}</p>
      </section>
      <section className="evidence-section evidence-caution">
        <SectionTitle icon="alert" level={level}>
          주의사항
        </SectionTitle>
        <p className="evidence-text">{caution}</p>
      </section>
      <section className="evidence-section evidence-divided">
        <SectionTitle icon="database" level={level}>
          데이터 출처
        </SectionTitle>
        {src ? (
          <div className="evidence-source">
            <p className="evidence-source-name">{src.name}</p>
            {(src.date || src.api) && (
              <p className="evidence-source-meta">
                {src.date && <span>{src.date}</span>}
                {src.api && (
                  <span>
                    <code>{src.api}</code>
                    {src.apiNote && <> {src.apiNote}</>}
                  </span>
                )}
              </p>
            )}
          </div>
        ) : (
          <p className="evidence-text">{source}</p>
        )}
      </section>
      <section className="evidence-section">
        <SectionTitle icon="tag" level={level}>
          사용 변수
        </SectionTitle>
        <ul className="evidence-vars" aria-label="사용 변수">
          {variables.map((v) => (
            <li key={v}>
              <code>{v}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

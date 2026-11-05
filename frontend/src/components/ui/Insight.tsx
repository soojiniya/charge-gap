import { createContext, useContext, useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Icon, type IconName } from './Icon';
import { parseSource } from '../../analysis/sourceParts';
import { SentenceLines } from '../../lib/sentences';

/**
 * Card가 제공하는 정보: 분석 근거 패널 제목에 그래프 번호·제목을 표시합니다.
 * inline: 차트 확대 창 안에서는 패널을 겹쳐 열지 않고 분석 근거를 바로 펼쳐 보여 줍니다.
 */
export const InsightContext = createContext<{
  title?: ReactNode;
  no?: number;
  inline?: boolean;
  /** Card 머리글의 정보(i) 버튼이 같은 설명 패널을 열 수 있게 Insight가 여는 함수를 등록합니다. */
  openRef?: MutableRefObject<(() => void) | null>;
  /** 패널 열림 상태를 Card 머리글 버튼(aria-expanded)에 알립니다. */
  onOpenChange?: (open: boolean) => void;
}>({});

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
  /** 계산 방법 섹션에 공통 안내 앞에 붙이는 지표별 계산식(분자·분모 등). 없으면 공통 안내만 표시합니다. */
  method?: ReactNode;
  /** (이전 버전 호환용) 좁은 카드 여부. 현재는 항상 한 줄 흐름으로 배치합니다. */
  stack?: boolean;
}

/**
 * 그래프 아래 분석 영역.
 * 1) 주요 분석 결과(가장 먼저, 강조 상자) → 2) 해석 → 3) 분석 근거(목적·선택 이유·주의사항·출처·변수).
 * 분석 근거는 카드 안에서 펼치지 않고 오른쪽 상세 패널로 엽니다. 카드 높이와 같은 행의 다른 카드가 흔들리지 않습니다.
 * 주요 결과와 해석은 각 그래프가 받은 실제 API 응답으로 계산한 문장입니다.
 */
export function Insight({ mode, modeNote, purpose, reason, findings, interpretation, caution, source, variables, method }: InsightProps) {
  const { title, no, inline, openRef, onOpenChange } = useContext(InsightContext);
  const [open, setOpen] = useState(false);
  const basis = modeNote ?? (mode === 'dynamic' ? '현재 필터 결과로 계산' : '전국 기준 고정 분석');
  const evidence = { purpose, reason, caution, source, variables, basis, mode, findings, method };
  useEffect(() => {
    if (inline || !openRef) return;
    openRef.current = () => setOpen(true);
    return () => {
      if (openRef.current) openRef.current = null;
    };
  }, [inline, openRef]);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
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
          <EvidenceBody {...evidence} level={4} showFindings={false} />
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
              그래프 설명 보기<span className="evidence-btn-detail">: 데이터 출처·기준일, 계산 방법, 주의사항</span>
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
          <EvidenceBody {...evidence} level={3} showFindings />
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
  method?: ReactNode;
  /** 계산 기준(현재 필터 결과로 계산 / 전국 기준 고정 등) */
  basis: string;
  mode: 'dynamic' | 'fixed';
  findings: ReactNode[];
  /** 패널에서는 주요 분석 결과를 다시 보여 주고, 차트 확대 창(바로 위에 결과가 있음)에서는 생략합니다. */
  showFindings: boolean;
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

/** 출처 항목 이름(원문 앞머리) → 화면 표기 */
const SOURCE_ITEM_LABEL: Record<string, string> = {
  '': '자료명',
  작성기관: '작성기관',
  제공: '제공 창구',
  '자료 기준': '자료 기준',
  '파일 저장': '파일 저장일',
  조회: '조회 시각',
  '이용 조건': '이용 조건',
};

/** 출처 문자열에서 기준일 관련 항목(자료 기준·파일 저장·조회)을 모아 한 줄로 */
function basisDates(src: ReturnType<typeof parseSource> | null): string | null {
  if (!src) return null;
  const parts = (src.items ?? [])
    .filter((i) => i.label === '자료 기준' || i.label === '파일 저장' || i.label === '조회')
    .map((i) => `${SOURCE_ITEM_LABEL[i.label ?? ''] ?? i.label} ${i.value}`);
  if (src.date) parts.push(src.date);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * 그래프 설명 본문(오른쪽 패널·차트 확대 창 공용). 원문은 그대로 표시합니다.
 * 맨 위 '한눈에 보기'에 데이터 출처·기준일·계산 기준을 모으고, 아래에 주요 분석 결과 → 분석 목적 → 계산 방법 →
 * 그래프 선택 이유 → 주의사항 → 데이터 출처(상세) → 사용 변수 순서로 둡니다.
 */
function EvidenceBody({ purpose, reason, caution, source, variables, basis, mode, findings, showFindings, level, method }: EvidenceProps) {
  const src = typeof source === 'string' ? parseSource(source) : null;
  const dates = basisDates(src);
  return (
    <div className="evidence">
      <dl className="evidence-glance" aria-label="한눈에 보기">
        <div>
          <dt>데이터 출처</dt>
          <dd>{src ? src.name : source}</dd>
        </div>
        <div>
          <dt>데이터 기준일</dt>
          <dd>{dates ?? '출처 항목 참조'}</dd>
        </div>
        <div>
          <dt>계산 기준</dt>
          <dd>
            <span className={`evidence-basis ${mode === 'dynamic' ? 'dynamic' : ''}`}>{basis}</span>
          </dd>
        </div>
      </dl>
      {showFindings && (
        <section className="evidence-section">
          <SectionTitle icon="trend" level={level}>
            주요 분석 결과
          </SectionTitle>
          {findings.length ? (
            <ul className="evidence-findings">
              {findings.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="evidence-text muted">표시할 결과가 없습니다.</p>
          )}
        </section>
      )}
      <section className="evidence-section">
        <SectionTitle icon="target" level={level}>
          분석 목적
        </SectionTitle>
        <p className="evidence-text">{purpose}</p>
      </section>
      <section className="evidence-section">
        <SectionTitle icon="table" level={level}>
          계산 방법
        </SectionTitle>
        {method && <div className="evidence-text evidence-method">{method}</div>}
        <p className="evidence-text">
          {mode === 'dynamic' ? '상단 필터를 바꾸면 API를 다시 요청해 새로 계산합니다. ' : '필터와 관계없이 같은 자료로 계산한 고정 분석입니다. '}
          계산 기준: {basis}.{src?.api ? <> 사용 API: <code>{src.api}</code>{src.apiNote ? ` ${src.apiNote}` : ''}.</> : null} 사용한 변수는 아래 목록에 있습니다.
        </p>
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
            {src.items && src.items.length > 0 && (
              <dl className="evidence-source-items">
                {src.items.map((item, i) => (
                  <div key={i} className={item.label === '이용 조건' ? `evidence-license ${/^공공누리 제1유형/.test(item.value) ? 'is-confirmed' : 'is-pending'}` : undefined}>
                    <dt>{SOURCE_ITEM_LABEL[item.label ?? ''] ?? item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
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

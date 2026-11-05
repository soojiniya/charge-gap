import { useState, type ReactNode } from 'react';
import type { BaseMeta } from '../../api/types';
import { EV_PNG_IDS, EV_PNG_VS_WEB } from '../../analysis/dataSources';
import { useStaticCharts } from '../../api/hooks';
import { assetUrl } from '../../api/client';
import { Modal } from './Modal';
import { InsightContext } from './Insight';
import { QueryState } from './QueryState';
import { Icon } from './Icon';
import { DELETION_LABEL, fmtInt } from '../../lib/format';

type Tab = 'chart' | 'table' | 'source' | 'report';

interface Props {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  detail: { chart?: ReactNode; table?: ReactNode; meta?: BaseMeta; staticChartIds?: number[]; note?: ReactNode; insight?: ReactNode };
}

export function ChartDetail({ title, sub, onClose, detail }: Props) {
  const tabs: { id: Tab; label: string }[] = [];
  if (detail.chart) tabs.push({ id: 'chart', label: '확대 차트' });
  if (detail.table) tabs.push({ id: 'table', label: '데이터 표' });
  if (detail.meta) tabs.push({ id: 'source', label: '출처와 기준' });
  if (detail.staticChartIds?.length) tabs.push({ id: 'report', label: '보고서 원본 그래프' });
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'chart');

  return (
    <Modal
      title={title}
      subtitle={sub}
      onClose={onClose}
      tabs={
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {detail.note && tab !== 'report' && (
        <div className="notice">
          <Icon name="info" />
          <div>{detail.note}</div>
        </div>
      )}
      {tab === 'chart' && (
        <div>
          {detail.chart}
          {detail.insight && <InsightContext.Provider value={{ title, inline: true }}>{detail.insight}</InsightContext.Provider>}
        </div>
      )}
      {tab === 'table' && detail.table}
      {tab === 'source' && detail.meta && <SourcePanel meta={detail.meta} />}
      {tab === 'report' && detail.staticChartIds && <ReportCharts ids={detail.staticChartIds} />}
    </Modal>
  );
}

const FILTER_LABEL: Record<string, string> = {
  region_code: '지역 코드',
  charger_type: '충전기 유형',
  deletion: '삭제 표시',
  operator_id: '운영기관 ID',
  ev_region_code: '등록 지역 코드',
  year_from: '시작 연도',
  year_to: '종료 연도',
  bbox: '지도 영역(bbox)',
  chart_id: '그래프 번호',
};

const SOURCE_LABEL: Record<string, string> = {
  provider: '제공기관',
  author: '작성기관',
  platform: '제공 창구',
  dataset: '자료명',
  reference_basis: '자료 기준',
  file_saved_date: '파일 저장일',
  official_update_label_at_collection: '수집 당시 공식 갱신 표시',
  revision_note: '공식 수치 수정 안내',
  license: '이용 조건',
  license_confirmed: '이용 조건 공식 확인',
  source: '원본 자료',
  file: '정제 파일',
  reference_month: '기준월',
  snapshot_date: '조회일',
  snapshot_start_at: '조회 시작',
  snapshot_end_at: '조회 종료',
  region_system: '지역 체계',
  unit: '단위',
  fuel: '연료 기준',
  period: '기간',
  partial_year: '부분 연도',
  measurement_cutoff_date: '집계 마감일',
  source_filename_date: '원본 파일명 날짜',
  geography: '지역 범위',
  source_url: '출처 URL',
  region_code_basis: '지역코드 대응 근거',
};

/** API는 키를 알파벳순으로 보내므로, 출처 항목은 SOURCE_LABEL에 적은 순서(제공기관 → … → 기존 항목)로 보여 줍니다. */
const SOURCE_KEYS = Object.keys(SOURCE_LABEL);
const sourceOrder = (k: string) => {
  const i = SOURCE_KEYS.indexOf(k);
  return i < 0 ? SOURCE_KEYS.length : i;
};

function SourcePanel({ meta }: { meta: BaseMeta }) {
  const filters = Object.entries(meta.filters ?? {});
  return (
    <>
      <div>
        <h3 className="card-title" style={{ marginBottom: 10 }}>
          이 응답에 적용된 요청변수
        </h3>
        <dl className="meta-grid">
          {filters.map(([k, v]) => (
            <div key={k}>
              <dt>{FILTER_LABEL[k] ?? k}</dt>
              <dd className="num">
                {v === null || v === undefined
                  ? '전체 (생략)'
                  : k === 'deletion'
                    ? DELETION_LABEL[String(v)] ?? String(v)
                    : Array.isArray(v)
                      ? v.join(', ')
                      : String(v)}
              </dd>
            </div>
          ))}
          {meta.matched && (
            <div>
              <dt>필터 일치 (matched)</dt>
              <dd>
                충전기 {fmtInt(meta.matched.charger_count)}기, 충전소 {fmtInt(meta.matched.station_count)}곳
              </dd>
            </div>
          )}
        </dl>
      </div>
      {Object.entries(meta.sources).map(([key, src]) => (
        <div key={key}>
          <h3 className="card-title" style={{ marginBottom: 10 }}>
            {key === 'ev_registration' ? '전기차 등록 자료' : key === 'chargers' ? '충전기 자료' : key === 'growth' ? '연도별 설치 통계' : '그래프 메타데이터'}
          </h3>
          <dl className="meta-grid">
            {Object.entries(src)
              .filter(([k]) => k !== 'legacy_field_aliases')
              .sort(([a], [b]) => sourceOrder(a) - sourceOrder(b))
              .map(([k, v]) => (
              <div key={k}>
                <dt>{SOURCE_LABEL[k] ?? k}</dt>
                <dd>
                  {k === 'source_url' && typeof v === 'string' ? (
                    <a href={v} target="_blank" rel="noreferrer">
                      {v}
                    </a>
                  ) : v === null ? (
                    '미기재'
                  ) : typeof v === 'boolean' ? (
                    v ? '확인됨 (공식 페이지에 명시)' : '확인 중'
                  ) : (
                    String(v)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <div>
        <h3 className="card-title" style={{ marginBottom: 10 }}>
          API 주의사항
        </h3>
        <ul className="note-list">
          {meta.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** 등록 PNG(1~3번)와 현재 웹 그래프의 기준월·지역 체계 차이 */
export function EvPngBasis() {
  return (
    <div className="table-wrap png-basis">
      <table className="table">
        <caption className="sr-only">보고서 PNG와 현재 웹 그래프의 기준 차이</caption>
        <thead>
          <tr>
            <th scope="col">구분</th>
            <th scope="col">기준월</th>
            <th scope="col">지역 체계</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">이 PNG (보존 기록)</th>
            <td>{EV_PNG_VS_WEB.png.month}</td>
            <td>{EV_PNG_VS_WEB.png.regions}</td>
          </tr>
          <tr>
            <th scope="row">현재 웹 그래프</th>
            <td>{EV_PNG_VS_WEB.web.month}</td>
            <td>{EV_PNG_VS_WEB.web.regions}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ReportCharts({ ids }: { ids: number[] }) {
  const q = useStaticCharts();
  const charts = q.data?.data.filter((c) => ids.includes(c.id)) ?? [];
  return (
    <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!charts.length}>
      <div className="notice warn">
        <Icon name="alert" />
        <div>{q.data?.meta.static_chart_warning ?? 'PNG는 제작 당시의 고정 그래프이며 필터가 적용되지 않습니다.'}</div>
      </div>
      {charts.map((c) => (
        <div key={c.id} style={{ display: 'grid', gap: 14 }}>
          {EV_PNG_IDS.includes(c.id) && <EvPngBasis />}
          <figure className="static-figure">
            <img
              src={assetUrl(c.image_url)}
              alt={`${c.title} (${c.chart_type}, ${c.period})`}
              width={c.image_pixels[0]}
              height={c.image_pixels[1]}
              loading="lazy"
            />
          </figure>
          <div className="prose">
            <div>
              <h4>그래프 {c.id}. {c.chart_type}</h4>
              <p>{c.purpose}</p>
            </div>
            <div>
              <h4>기간</h4>
              <p>{c.period}</p>
            </div>
            <div>
              <h4>결과</h4>
              <p>{c.results}</p>
            </div>
            <div>
              <h4>표현 방식</h4>
              <p>{c.reason}</p>
            </div>
            <div>
              <h4>해석 주의</h4>
              <p>{c.caution}</p>
            </div>
            <div>
              <h4>파일</h4>
              <p className="num small muted">{c.filename}</p>
            </div>
          </div>
        </div>
      ))}
    </QueryState>
  );
}

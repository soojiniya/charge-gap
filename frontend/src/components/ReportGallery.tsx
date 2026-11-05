import { useState } from 'react';
import { useStaticCharts } from '../api/hooks';
import { assetUrl } from '../api/client';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { QueryState } from './ui/QueryState';
import { ReportCharts } from './ui/ChartDetail';
import { EV_PNG_IDS } from '../analysis/dataSources';

/** /api/charts 메타데이터 + /api/charts/{id}/image PNG. 보고서용 고정 그래프 10종. */
export function ReportGallery({ ids, span = 12 }: { ids?: number[]; span?: 12 | 6 | 5 | 7 }) {
  const q = useStaticCharts();
  const [openId, setOpenId] = useState<number | null>(null);
  const charts = (q.data?.data ?? []).filter((c) => !ids || ids.includes(c.id));
  const opened = charts.find((c) => c.id === openId);

  return (
    <Card
      span={span}
      title="보고서용 원본 그래프"
      sub="Matplotlib·Seaborn 고정 PNG입니다. 등록 PNG(01–03)는 2025년 12월·당시 17개 시도(광주·전남 따로) 기록이고, 위의 웹 그래프는 2026년 9월·16개 지역(전남광주 통합)입니다."
      scope={{ kind: 'fixed', label: '고정 PNG' }}
    >
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!charts.length} height={180}>
        <div className="gallery">
          {charts.map((c) => (
            <button key={c.id} type="button" className="thumb" onClick={() => setOpenId(c.id)} aria-label={`그래프 ${c.id} ${c.title} 크게 보기`}>
              <img src={assetUrl(c.image_url)} alt="" loading="lazy" decoding="async" />
              <span>
                <b className="num" style={{ color: 'var(--point)', marginRight: 6 }}>
                  {String(c.id).padStart(2, '0')}
                </b>
                {c.title}
                {EV_PNG_IDS.includes(c.id) && <em className="thumb-basis">2025-12 · 17개 시도</em>}
              </span>
            </button>
          ))}
        </div>
      </QueryState>
      {opened && (
        <Modal title={opened.title} subtitle={`${opened.chart_type}, ${opened.period}`} onClose={() => setOpenId(null)}>
          <ReportCharts ids={[opened.id]} />
        </Modal>
      )}
    </Card>
  );
}

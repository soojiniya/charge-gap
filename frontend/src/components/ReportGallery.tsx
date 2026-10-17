import { useState } from 'react';
import { useStaticCharts } from '../api/hooks';
import { assetUrl } from '../api/client';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { QueryState } from './ui/QueryState';
import { ReportCharts } from './ui/ChartDetail';

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
      sub="Matplotlib·Seaborn으로 제작해 검증한 PNG. 필터와 무관한 고정 이미지입니다."
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

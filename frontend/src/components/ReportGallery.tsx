import { useState } from 'react';
import { usePythonCharts, pythonChartUrl } from '../api/pythonCharts';
import { fmtInt } from '../lib/format';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { QueryState } from './ui/QueryState';
import { PythonChartBody } from './ui/PythonChartView';

/**
 * Python Visualization 페이지의 "Python 데이터 시각화 그래프": 현재 CHARGE GAP 자료를 Matplotlib·Seaborn으로 그린 고정 PNG 10개.
 * 이미지와 설명은 웹 정적 파일(public/python-charts)이며, 웹사이트 필터에 따라 바뀌지 않습니다.
 * 접기·펼치기 없이 10개를 항상 표시합니다(데스크톱 5열×2행, 태블릿 2열, 모바일 1열).
 */
export function PythonChartGallery() {
  const q = usePythonCharts();
  const d = q.data?.data;
  return (
    <Card
      span={12}
      className="chart-archive python-charts"
      title="Python 데이터 시각화 그래프"
      sub={
        d
          ? `현재 CHARGE GAP 자료(전기차 ${d.ev_registration.date} ${fmtInt(d.ev_registration.total)}대, 충전기 ${d.chargers.date} 전체 ${fmtInt(d.chargers.total)}기, 설치 통계 ${d.growth.years[0]}–${d.growth.years[1]}년)를 Matplotlib·Seaborn으로 그린 고정 PNG 10개입니다. 웹사이트 필터에 따라 바뀌지 않습니다.`
          : '현재 CHARGE GAP 자료를 Matplotlib·Seaborn으로 그린 고정 PNG 10개입니다. 웹사이트 필터에 따라 바뀌지 않습니다.'
      }
      scope={{ kind: 'fixed', label: '고정 PNG · 필터 무관' }}
    >
      <div className="pyc-wrap">
        <Gallery />
      </div>
    </Card>
  );
}

function Gallery() {
  const q = usePythonCharts();
  const [openId, setOpenId] = useState<number | null>(null);
  const charts = q.data?.charts ?? [];
  const opened = charts.find((c) => c.id === openId);
  return (
    <>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!charts.length} height={180}>
        <div className="gallery pyc-gallery">
          {charts.map((c) => (
            <button key={c.id} type="button" className="thumb" onClick={() => setOpenId(c.id)} aria-label={`Python 그래프 ${c.id} ${c.title} 크게 보기`}>
              <img src={pythonChartUrl(c.file)} alt="" loading="lazy" decoding="async" width={c.image_pixels[0]} height={c.image_pixels[1]} />
              <span>
                <b className="num" style={{ color: 'var(--point)', marginRight: 6 }}>
                  PY {String(c.id).padStart(2, '0')}
                </b>
                {c.title}
              </span>
              <dl className="thumb-meta">
                <div>
                  <dt>기법</dt>
                  <dd>{c.technique}</dd>
                </div>
                <div>
                  <dt>라이브러리</dt>
                  <dd>{c.libraries.join(' · ')}</dd>
                </div>
                <div>
                  <dt>기준일</dt>
                  <dd>{c.data_date}</dd>
                </div>
                <div>
                  <dt>삭제 기준</dt>
                  <dd>{c.deletion}</dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
        {q.data && (
          <p className="small muted pyc-foot">
            생성: {q.data.generator} · Matplotlib {q.data.libraries.matplotlib} · Seaborn {q.data.libraries.seaborn} · 글꼴 {q.data.font}
          </p>
        )}
      </QueryState>
      {opened && q.data && (
        <Modal title={`Python 그래프 ${String(opened.id).padStart(2, '0')} · ${opened.title}`} subtitle={`${opened.technique} · ${opened.data_date}`} onClose={() => setOpenId(null)}>
          <PythonChartBody chart={opened} notice={q.data.fixed_notice} />
        </Modal>
      )}
    </>
  );
}

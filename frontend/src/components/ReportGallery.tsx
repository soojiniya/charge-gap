import { useState } from 'react';
import { usePythonCharts, useOriginalPythonCharts, useWebMatchedPythonCharts, pythonChartUrl, originalPythonChartUrl, webMatchedPythonChartUrl } from '../api/pythonCharts';
import { fmtInt } from '../lib/format';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { QueryState } from './ui/QueryState';
import { PythonChartBody } from './ui/PythonChartView';

/**
 * Python Visualization 페이지의 "Python 데이터 시각화 그래프" 갤러리 (고정 PNG 10개, 웹사이트 필터와 무관).
 *  - variant "original"(페이지 기본): 처음 제작한 원본 PNG(outputs/charts/를 그대로 복사한 public/python-charts-original).
 *    흰 배경 원본 그대로이며 전기차 등록 그래프는 2025년 12월 자료 기준입니다.
 *  - variant "final": 2026년 9월 자료로 다시 그린 다크 테마 PNG(public/python-charts). 웹 그래프 상세 보기의 Python 탭이 계속 사용합니다.
 *  - variant "web"(Python Visualization 페이지): 현재 웹사이트 그래프 1~10을 같은 종류·자료·기준으로 Matplotlib·Seaborn에서
 *    다시 구현한 흰 배경 PNG(public/python-charts-web = outputs/charts_web_matched_2026).
 * 접기·펼치기 없이 10개를 항상 표시합니다.
 */
type Variant = 'web' | 'original' | 'final';
const VARIANTS = {
  web: { useCharts: useWebMatchedPythonCharts, url: webMatchedPythonChartUrl, label: 'PY', className: 'python-charts-original', titlePrefix: 'Python 그래프' },
  original: { useCharts: useOriginalPythonCharts, url: originalPythonChartUrl, label: '원본', className: 'python-charts-original', titlePrefix: 'Python 원본 그래프' },
  final: { useCharts: usePythonCharts, url: pythonChartUrl, label: 'PY', className: '', titlePrefix: 'Python 그래프' },
} as const;

export function PythonChartGallery({ variant = 'final' }: { variant?: Variant }) {
  const v = VARIANTS[variant];
  const q = v.useCharts();
  const d = q.data?.data;
  const sub =
    variant === 'web'
      ? d
        ? `현재 웹사이트 그래프 1~10과 같은 그래프 종류·자료·집계 기준(웹 기본 필터)을 Matplotlib·Seaborn으로 다시 구현한 PNG 10개입니다. 전기차 ${d.ev_registration.date} ${fmtInt(d.ev_registration.total)}대, 충전기 ${d.chargers.date} 전체 ${fmtInt(d.chargers.total)}기(그래프 5만 비삭제 표시), 설치 통계 ${d.growth.years[0]}–${d.growth.years[1]}년 기준이며 웹사이트 필터에 따라 바뀌지 않습니다.`
        : '현재 웹사이트 그래프 1~10을 Matplotlib·Seaborn으로 다시 구현한 PNG 10개입니다. 웹사이트 필터에 따라 바뀌지 않습니다.'
      : variant === 'original'
      ? d
        ? `처음 Python(Matplotlib·Seaborn)으로 제작한 원본 PNG 10개를 수정 없이 보여 줍니다. 전기차 등록 그래프(01–03)는 ${d.ev_registration.date} 자료(${fmtInt(d.ev_registration.total)}대, ${d.ev_registration.regions}개 시도), 충전기 그래프는 ${d.chargers.snapshot} 조회 자료, 설치 추이는 ${d.growth.years[0]}–${d.growth.years[1]}년 통계 기준입니다. 웹사이트 필터에 따라 바뀌지 않습니다.`
        : '처음 Python(Matplotlib·Seaborn)으로 제작한 원본 PNG 10개를 수정 없이 보여 줍니다. 웹사이트 필터에 따라 바뀌지 않습니다.'
      : d
        ? `현재 CHARGE GAP 자료(전기차 ${d.ev_registration.date} ${fmtInt(d.ev_registration.total)}대, 충전기 ${d.chargers.date} 전체 ${fmtInt(d.chargers.total)}기, 설치 통계 ${d.growth.years[0]}–${d.growth.years[1]}년)를 Matplotlib·Seaborn으로 그린 고정 PNG 10개입니다. 웹사이트 필터에 따라 바뀌지 않습니다.`
        : '현재 CHARGE GAP 자료를 Matplotlib·Seaborn으로 그린 고정 PNG 10개입니다. 웹사이트 필터에 따라 바뀌지 않습니다.';
  return (
    <Card
      span={12}
      className={`chart-archive python-charts ${v.className}`.trim()}
      title="Python 데이터 시각화 그래프"
      sub={sub}
      scope={{ kind: 'fixed', label: variant === 'original' ? '원본 PNG · 필터 무관' : '고정 PNG · 필터 무관' }}
    >
      <div className="pyc-wrap">
        <Gallery variant={variant} />
      </div>
    </Card>
  );
}

function Gallery({ variant }: { variant: Variant }) {
  const v = VARIANTS[variant];
  const q = v.useCharts();
  const [openId, setOpenId] = useState<number | null>(null);
  const charts = q.data?.charts ?? [];
  const opened = charts.find((c) => c.id === openId);
  const no = (id: number) => String(id).padStart(2, '0');
  return (
    <>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} isEmpty={!charts.length} height={180}>
        <div className="gallery pyc-gallery">
          {charts.map((c) => (
            <button key={c.id} type="button" className="thumb" onClick={() => setOpenId(c.id)} aria-label={`${v.titlePrefix} ${c.id} ${c.title} 크게 보기`}>
              <img src={v.url(c.file)} alt="" loading="lazy" decoding="async" width={c.image_pixels[0]} height={c.image_pixels[1]} />
              <span>
                <b className="num" style={{ color: 'var(--point)', marginRight: 6 }}>
                  {v.label} {no(c.id)}
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
        <Modal title={`${v.titlePrefix} ${no(opened.id)} · ${opened.title}`} subtitle={`${opened.technique} · ${opened.data_date}`} onClose={() => setOpenId(null)}>
          <PythonChartBody chart={opened} notice={q.data.fixed_notice} imageUrl={v.url} />
        </Modal>
      )}
    </>
  );
}

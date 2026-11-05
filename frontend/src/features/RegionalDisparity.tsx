import { useHashScroll } from '../lib/hashScroll';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Insight } from '../components/ui/Insight';
import { QueryState } from '../components/ui/QueryState';
import { useFilterOptions, useRegionalDisparity } from '../api/hooks';
import { CHARGER_TYPE_CODES, useFilters } from '../state/filters';
import { DELETION_LABEL, fmtInt } from '../lib/format';
import { CH_SRC, EV_SRC } from '../analysis/dataSources';
import {
  DEFAULT_METRIC,
  DEFAULT_TYPE,
  DISPARITY_DEFS,
  DISPARITY_OPTIONS as OPTIONS,
  GAP_KEYS,
  NARRATIVE_NOTE,
  compareToNational,
  denomBasis,
  denomUnit,
  denominator,
  diffFor,
  diffText,
  heatColor,
  heatScale,
  headline,
  metricReading,
  metricValue,
  narrate,
  nationalValue,
  parseGapParams,
  rankLine,
  rankOf,
  regionLabel,
  type DisparityOption,
} from '../analysis/disparity';
import type { DisparityMetricKey, RegionalDisparityData, RegionalDisparityMeta, RegionalDisparityRow } from '../api/types';
import { buildDisparityCsv, buildDisparityReportHtml, disparityExportFilename, whenReportReady } from './disparityExport';
// 보고서 창은 사이트 CSP(style-src 'self')를 물려받으므로 인쇄용 CSS를 같은 출처 파일로 불러옵니다.
import reportCssUrl from './disparityReport.css?url';

/**
 * 전국 충전 인프라 구성 격차 (16개 지역).
 * 값·순위·전국 기준은 모두 /api/regional-disparity 응답을 그대로 표시합니다. 이 파일은 표시(UI)만 담당하며
 * 새 지표 계산은 하지 않습니다(전국 대비 차이 = 지역 값 − 전국 값, 화면 표시용 뺄셈만).
 * 지표·유형 선택은 URL(gap_metric, gap_type)에 저장해 새로고침·공유 링크·뒤로 가기에서 유지합니다.
 */

/** gap_metric·gap_type URL 상태. 사용자가 바꾸면 기록을 남기고(push) 뒤로 가기로 이전 선택에 돌아갈 수 있습니다. */
function useGapParams() {
  const [params, setParams] = useSearchParams();
  const { metric, type, remove } = useMemo(() => parseGapParams(params, CHARGER_TYPE_CODES), [params]);
  const removeKey = remove.join(',');
  useEffect(() => {
    if (!removeKey) return;
    // 허용되지 않은 값은 기본값으로 보고 URL에서 지웁니다(기록을 남기지 않음).
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        removeKey.split(',').forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );
  }, [removeKey, setParams]);
  const select = useCallback(
    (patch: { metric?: DisparityMetricKey; type?: string }) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        const m = patch.metric ?? (parseGapParams(prev, CHARGER_TYPE_CODES).metric as DisparityMetricKey);
        const t = patch.type ?? parseGapParams(prev, CHARGER_TYPE_CODES).type;
        if (m === DEFAULT_METRIC) next.delete(GAP_KEYS.metric);
        else next.set(GAP_KEYS.metric, m);
        if (m !== 'type_mix' || t === DEFAULT_TYPE) next.delete(GAP_KEYS.type);
        else next.set(GAP_KEYS.type, t);
        return next;
      });
    },
    [setParams],
  );
  return { metric, type, select };
}

/** Overview 등에서 이 분석으로 바로 오는 주소: /regional-explorer?…#regional-gap */
export const REGIONAL_GAP_ANCHOR = 'regional-gap';

export function RegionalDisparitySection() {
  const [exportStatus, setExportStatus] = useState('');
  const { chargerParams, state, update } = useFilters();
  const query = useRegionalDisparity(chargerParams);
  const opts = useFilterOptions();
  const { metric, type, select } = useGapParams();
  // 내보내기 안내(CSV 저장·PDF 인쇄 창)는 버튼을 누른 직후에만 보이고, 분석 지표·유형·필터를 바꾸면 지웁니다.
  useEffect(() => {
    setExportStatus('');
  }, [metric, type, chargerParams]);
  const data = query.data?.data;
  const meta = query.data?.meta;
  // Overview '주요 분석 발견' 링크(#regional-gap)로 들어왔을 때만, 이 분석의 첫 응답이 그려진 뒤 이 카드로 이동합니다.
  useHashScroll(REGIONAL_GAP_ANCHOR, !query.isLoading);
  const active = OPTIONS.find((o) => o.key === metric)!;
  const typeName = (code: string) => opts.data?.charger_types.find((t) => t.code === code)?.name;
  // URL로 받은 유형이 현재 필터 결과에 없으면(전국 0기) 그 유형도 0기로 목록에 둡니다.
  const typeOptions = useMemo(() => {
    const list = data?.national.type_mix ?? [];
    return list.some((x) => x.charger_type_code === type) ? list : [...list, { charger_type_code: type, charger_count: 0, denominator: 0, value_pct: null }];
  }, [data, type]);
  const metricName = metric === 'type_mix' ? `유형 ${type}${typeName(type) ? ` ${typeName(type)}` : ''} 비중` : active.short;
  const rows = useMemo(
    () =>
      data?.regions
        .map((r) => ({ ...r, value: metricValue(r, metric, type) }))
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.region_code.localeCompare(b.region_code)) ?? [],
    [data, metric, type],
  );
  const national = data ? nationalValue(data, metric, type) : null;
  const max = Math.max(0, national ?? 0, ...rows.map((r) => r.value ?? 0));
  const selectRegion = (code: string) => update({ region: state.region === code ? undefined : code });
  const selectedRow = data?.regions.find((r) => r.region_code === state.region);
  const filters = [
    state.type && `유형 ${state.type}`,
    state.deletion !== 'all' && `삭제 상태: ${DELETION_LABEL[state.deletion] ?? state.deletion}`,
    state.operator && `운영기관 ${state.operator}`,
  ].filter(Boolean);
  const exportContext = data ? {
    data,
    meta,
    metric,
    type,
    typeName: typeName(type),
    selectedRegionCode: selectedRow?.region_code,
    filters: filters as string[],
    source: `${CH_SRC}, /api/regional-disparity · 참고(비결합): ${EV_SRC}`,
    stylesheetHref: new URL(reportCssUrl, window.location.href).href,
  } : undefined;
  const downloadCsv = () => {
    if (!exportContext) return;
    try {
      const blob = new Blob([buildDisparityCsv(exportContext)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = disparityExportFilename(metric, type, 'csv');
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus('현재 16개 지역 비교 결과를 CSV로 저장했습니다.');
    } catch {
      setExportStatus('CSV를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };
  const printReport = () => {
    if (!exportContext) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setExportStatus('보고서 창이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.');
      return;
    }
    try {
      printWindow.opener = null;
      printWindow.document.open();
      printWindow.document.write(buildDisparityReportHtml(exportContext));
      printWindow.document.close();
      printWindow.document.title = disparityExportFilename(metric, type, 'pdf').replace(/\.pdf$/, '');
      setExportStatus('인쇄 창을 열었습니다. 인쇄 대상에서 “PDF로 저장”을 선택해 주세요.');
      // 스타일시트·글꼴이 준비된 뒤 인쇄합니다(최대 4초 대기 후에는 그대로 진행).
      void whenReportReady(printWindow.document).then(() => {
        printWindow.focus();
        printWindow.print();
      });
    } catch {
      printWindow.close();
      setExportStatus('PDF 인쇄 화면을 열지 못했습니다. 브라우저 설정을 확인해 주세요.');
    }
  };
  const nationalDenominator = data
    ? metric === 'high_100kw'
      ? data.national.high_100kw.denominator
      : metric === 'chargers_per_station'
        ? data.national.chargers_per_station.denominator
        : metric === 'deletion_share'
          ? data.national.deletion_share.denominator
          : metric === 'operator_hhi'
            ? data.national.operator_hhi.operator_count
            : data.national.chargers_per_station.numerator
    : null;

  return (
    <Card
      id={REGIONAL_GAP_ANCHOR}
      span={12}
      className="disparity-card"
      title="전국 충전 인프라 구성 격차"
      sub="2026-10-15 충전기 조회 자료에서 지역별 구성 차이를 비교합니다. 실제 충전 수요나 부족률을 나타내지 않습니다."
      scope={{ kind: 'filtered', label: '16개 지역 · 필터 기준' }}
      isFetching={query.isFetching && !query.isLoading}
      insight={
        data ? (
          <DisparityInsight data={data} meta={meta} metric={metric} type={type} metricName={metricName} typeName={typeName(type)} selected={selectedRow} />
        ) : undefined
      }
    >
      <div className="disparity-toolbar">
        <label className="field disparity-control">
          <span className="field-label">분석 지표</span>
          <select className="select cg-menu-select" value={metric} onChange={(e) => select({ metric: e.target.value as DisparityMetricKey })}>
            {OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {metric === 'type_mix' && (
          <label className="field disparity-control">
            <span className="field-label">충전기 유형</span>
            <select className="select" value={type} onChange={(e) => select({ type: e.target.value })}>
              {typeOptions.map((x) => (
                <option key={x.charger_type_code} value={x.charger_type_code}>
                  {x.charger_type_code} {typeName(x.charger_type_code) ?? ''} · {x.charger_count.toLocaleString('ko-KR')}기
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="disparity-export-actions" aria-label="분석 결과 내보내기">
          <button type="button" className="btn btn-sm" onClick={downloadCsv} disabled={!data || query.isFetching || query.isError}>
            CSV 다운로드
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={printReport} disabled={!data || query.isFetching || query.isError}>
            PDF 보고서
          </button>
        </div>
        <dl className="disparity-basis" aria-label="현재 적용 조건">
          <div>
            <dt>현재 적용</dt>
            <dd>{filters.length ? filters.join(' · ') : '유형·운영기관 필터 없음'}</dd>
          </div>
          <div>
            <dt>지역 필터</dt>
            <dd>16개 지역 비교에는 적용하지 않고, 선택 지역 강조와 지도에만 씁니다.</dd>
          </div>
          <div>
            <dt>전국 기준</dt>
            <dd>지역 비율의 평균이 아니라 전국 분자·분모를 합산해 계산합니다.</dd>
          </div>
        </dl>
        {/* 안내 문구 뒤에 두어 메시지가 나타나도 버튼·안내 위치가 바뀌지 않음 */}
        {exportStatus && <p className="small muted disparity-export-status" role="status" aria-live="polite">{exportStatus}</p>}
      </div>
      {metric === 'deletion_share' && (
        <p className="notice warn" role="note">
          삭제 표시 비중은 삭제 상태 필터를 제외한 모집단에서 계산합니다. 삭제 표시는 자료상 분류이며 실제 이용 가능 여부를 뜻하지 않습니다.
        </p>
      )}
      <QueryState isLoading={query.isLoading} error={query.error} onRetry={() => query.refetch()} isEmpty={!rows.length} emptyTitle="비교할 지역 자료가 없습니다" height={280}>
        {data && (
          <>
            <dl className="disparity-summary" aria-live="polite">
              <div className="disparity-stat is-key">
                <dt>전국 기준 · {metricName}</dt>
                <dd className="num">{active.format(national)}</dd>
              </div>
              <div className="disparity-stat">
                <dt>{metric === 'operator_hhi' ? '운영기관 그룹' : `전국 분모 (${denomBasis(metric)})`}</dt>
                <dd className="num">
                  {fmtInt(nationalDenominator ?? 0)}
                  {metric === 'operator_hhi' ? '개' : denomUnit(metric)}
                </dd>
              </div>
              <div className="disparity-stat">
                <dt>필터 일치 충전기</dt>
                <dd className="num">{fmtInt(data.national.chargers_per_station.numerator ?? 0)}기</dd>
              </div>
            </dl>

            <RegionSummary row={selectedRow} data={data} type={type} typeName={typeName} onClear={() => update({ region: undefined })} />

            <div className="disparity-layout">
              <section className="disparity-main" aria-labelledby="disparity-bars-title">
                <div className="disparity-panel-head">
                  <h3 id="disparity-bars-title">16개 지역 비교 · {metricName}</h3>
                  <div className="disparity-legend" aria-hidden="true">
                    <i /> 지역 값 <i className="national-key" /> 전국 기준선
                  </div>
                </div>
                <div className="disparity-bar-head" aria-hidden="true">
                  <span>지역</span>
                  <span>막대</span>
                  <span>{active.short}</span>
                  <span>순위</span>
                  <span>전국 대비 차이</span>
                </div>
                <div className="disparity-bars" role="list" aria-label={`${metricName} 지역별 순위 막대그래프`}>
                  {rows.map((r) => {
                    const value = r.value;
                    const diff = diffFor(value, national);
                    const pct = value == null || max <= 0 ? 0 : (value / max) * 100;
                    const selected = state.region === r.region_code;
                    const rank = rankOf(r, metric, type);
                    return (
                      <div className={`disparity-bar-row ${selected ? 'is-selected' : ''}`} role="listitem" key={r.region_code}>
                        <button
                          type="button"
                          className="disparity-region"
                          aria-pressed={selected}
                          aria-label={`${regionLabel(r)}: ${rank ?? '—'}위, ${active.format(value)}, 전국 대비 ${diffText(diff, active)}. 지도 지역 필터 ${selected ? '해제' : '적용'}`}
                          onClick={() => selectRegion(r.region_code)}
                        >
                          {regionLabel(r)}
                        </button>
                        {/* 같은 동작의 큰 클릭 영역(마우스용). 키보드는 왼쪽 지역 버튼으로 한 번만 지나갑니다. */}
                        <button type="button" className="disparity-track" tabIndex={-1} aria-hidden="true" onClick={() => selectRegion(r.region_code)}>
                          <span style={{ width: `${pct}%` }} />
                          <i className="disparity-national-mark" style={{ left: `${max ? ((national ?? 0) / max) * 100 : 0}%` }} />
                        </button>
                        <span className="disparity-value">{active.format(value)}</span>
                        <span className="disparity-rank">{rank ? `${rank}위` : '—'}</span>
                        <span className={`disparity-diff ${diff == null ? '' : diff >= 0 ? 'is-up' : 'is-down'}`}>{diffText(diff, active)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="disparity-side" aria-labelledby="disparity-heat-title">
                <div className="disparity-panel-head">
                  <h3 id="disparity-heat-title">지역 격차 히트맵</h3>
                  <p className="small muted">색은 전국 대비 차이의 방향과 크기 · 범례는 표 아래</p>
                </div>
                <div className="disparity-heat" role="table" aria-label={`${metricName} 지역별 전국 대비 차이 히트맵`}>
                  <div className="disparity-heat-head" role="row">
                    <span role="columnheader">지역</span>
                    <span role="columnheader">
                      {active.short} ({active.unit})
                    </span>
                    <span role="columnheader">전국 대비 차이</span>
                  </div>
                  {rows.map((r) => {
                    const v = r.value;
                    const delta = diffFor(v, national);
                    return (
                      <button type="button" role="row" key={r.region_code} className="disparity-heat-row" aria-pressed={state.region === r.region_code} onClick={() => selectRegion(r.region_code)}>
                        <span role="cell">{regionLabel(r)}</span>
                        <span role="cell">{active.format(v)}</span>
                        <span
                          role="cell"
                          data-heat={delta == null ? 'none' : delta >= 0 ? 'up' : 'down'}
                          style={{ background: heatColor(delta, national) }}
                        >
                          {diffText(delta, active)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <HeatLegend option={active} national={national ?? null} />
              </section>
            </div>

            <h3 className="disparity-table-title">순위표 · {metricName}</h3>
            <div className="table-wrap disparity-table-wrap" tabIndex={0} role="region" aria-label={`${metricName} 지역별 순위표 (가로 스크롤 가능)`}>
              <table className="table disparity-table">
                <caption className="sr-only">{metricName} 지역별 순위 및 분모</caption>
                <thead>
                  <tr>
                    <th scope="col">순위</th>
                    <th scope="col">지역</th>
                    <th scope="col">
                      {active.short} ({active.unit})
                    </th>
                    <th scope="col">전국 대비 차이 ({active.diffUnit})</th>
                    <th scope="col">분모 ({denomBasis(metric)})</th>
                    <th scope="col">지도 선택</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rank = rankOf(r, metric, type);
                    const selected = state.region === r.region_code;
                    return (
                      <tr key={r.region_code} className={selected ? 'is-selected' : ''}>
                        <td className="n">{rank ? `${rank}위` : '—'}</td>
                        <td>{regionLabel(r)}</td>
                        <td className="n">{active.format(r.value)}</td>
                        <td className="n">{diffText(diffFor(r.value, national), active)}</td>
                        <td className="n">
                          {fmtInt(denominator(r, metric, type) ?? 0)}
                          {denomUnit(metric)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm"
                            aria-pressed={selected}
                            aria-label={`${regionLabel(r)} 지도 지역 필터 ${selected ? '해제' : '적용'}`}
                            onClick={() => selectRegion(r.region_code)}
                          >
                            {selected ? '선택됨' : '지도 필터'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small muted disparity-foot">
              <span className="line-block">전국 기준값은 전국 분자·분모를 각각 합산해 계산합니다. </span>
              <span className="line-block">삭제 표시 비중 계산에는 삭제 상태 필터가 적용되지 않습니다. </span>
              <span className="line-block">이는 공급 구성의 상대적 차이이며 수요 대비 부족률이 아닙니다. </span>
              <span className="line-block">분모 기준: {denomBasis(metric)}.</span>
            </p>
          </>
        )}
      </QueryState>
    </Card>
  );
}

/**
 * 선택 지역 요약: API가 이미 돌려준 5개 지표의 값·순위·전국 기준을 한 곳에 모아 보여 줍니다(새 계산 없음).
 * 각 지표 아래에는 같은 값으로 만든 규칙 기반 분석 문장(analysis/disparity.ts narrate)을 붙입니다. 지역을 고르지 않았으면 사용 안내만 표시합니다.
 */
function RegionSummary({
  row,
  data,
  type,
  typeName,
  onClear,
}: {
  row: RegionalDisparityRow | undefined;
  data: RegionalDisparityData;
  type: string;
  typeName: (code: string) => string | undefined;
  onClear: () => void;
}) {
  if (!row) {
    return (
      <div className="disparity-region-summary is-empty" role="status">
        <p className="disparity-hint">
          <span>지역 이름이나 막대를 누르면 그 지역의 5개 지표(값·순위·전국 대비 차이)를 여기에 모아 보여 줍니다.</span>
          <span>지도와 지역 필터도 함께 바뀝니다.</span>
        </p>
      </div>
    );
  }
  return (
    <section className="disparity-region-summary" aria-labelledby="disparity-region-summary-title">
      <header className="disparity-region-summary-head">
        <h3 id="disparity-region-summary-title">
          선택 지역 요약 · <strong>{regionLabel(row)}</strong>
        </h3>
        <span className="small muted">
          충전기 {fmtInt(row.charger_count)}기 · 충전소 {fmtInt(row.station_count)}곳
        </span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClear}>
          선택 해제
        </button>
      </header>
      <dl className="disparity-region-metrics">
        {OPTIONS.map((o) => {
          const v = metricValue(row, o.key, type);
          const n = nationalValue(data, o.key, type);
          const name = o.key === 'type_mix' ? `유형 ${type}${typeName(type) ? ` ${typeName(type)}` : ''} 비중` : o.label;
          const sentences = narrate(data, row, o.key, type, { typeName: typeName(type) });
          const reading = metricReading(data, row, o.key, type);
          return (
            <div key={o.key} data-metric={o.key} data-status={reading.status}>
              <dt>{name}</dt>
              <dd>
                <span className="num disparity-region-value">{o.format(v)}</span>
                <span className="disparity-region-rank">
                  <span>{rankLine(data, row, o.key, type)}</span>
                  <span>
                    전국 대비 <span className="num">{diffText(diffFor(v, n), o)}</span>
                  </span>
                </span>
                <p className="disparity-region-headline">{headline(data, row, o.key, type)}</p>
                <details className="disparity-region-more">
                  <summary>상세 분석 보기</summary>
                  <p className="disparity-region-note">{sentences.join(' ')}</p>
                </details>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="small muted disparity-region-caveat">{NARRATIVE_NOTE}</p>
    </section>
  );
}

/** 히트맵 색 범례: 셀과 같은 heatColor 함수로 그립니다. */
function HeatLegend({ option, national }: { option: DisparityOption; national: number | null }) {
  const scale = heatScale(national);
  const scaleText = diffText(scale, option).slice(1);
  const ramp = (sign: 1 | -1) => `linear-gradient(to right, ${heatColor(sign * 1e-12, national)}, ${heatColor(sign * scale, national)})`;
  return (
    <div className="disparity-heat-legend" role="group" aria-label="히트맵 색 범례">
      <ul>
        <li>
          <i className="heat-ramp" style={{ background: ramp(1) }} aria-hidden="true" />
          <span>전국보다 높음 (+, 청록)</span>
        </li>
        <li>
          <i className="heat-ramp" style={{ background: ramp(-1) }} aria-hidden="true" />
          <span>전국보다 낮음 (−, 보라)</span>
        </li>
        <li>
          <i className="heat-swatch" style={{ background: heatColor(0, national) }} aria-hidden="true" />
          <span>차이 0: 가장 옅은 청록 (+0 표시)</span>
        </li>
        <li>
          <i className="heat-swatch is-none" aria-hidden="true" />
          <span>— 계산 불가(0건·분모 0): 색 없음</span>
        </li>
      </ul>
      <p className="small muted">
        색 진하기는 차이의 크기(절댓값)에 비례하며, 차이가 {national != null && national !== 0 ? `전국 기준값 크기(${scaleText})` : scaleText} 이상이면 가장 진합니다. 색은 크기만
        나타내며 좋고 나쁨을 뜻하지 않습니다.
      </p>
    </div>
  );
}

/** 설명(i) 패널·주요 결과: 기존 Insight를 그대로 쓰고, 계산 방법에 지표별 분자·분모와 API 규칙 원문을 넣습니다. */
function DisparityInsight({
  data,
  meta,
  metric,
  type,
  metricName,
  typeName,
  selected,
}: {
  data: RegionalDisparityData;
  meta: RegionalDisparityMeta | undefined;
  metric: DisparityMetricKey;
  type: string;
  metricName: string;
  typeName?: string;
  selected?: RegionalDisparityRow;
}) {
  const o = OPTIONS.find((x) => x.key === metric)!;
  const def = DISPARITY_DEFS[metric];
  const national = nationalValue(data, metric, type);
  const rows = data.regions.map((r) => ({ r, v: metricValue(r, metric, type), rank: rankOf(r, metric, type) }));
  const ranked = rows.filter((x) => x.v != null && x.rank != null);
  const topRank = ranked.length ? Math.min(...ranked.map((x) => x.rank!)) : null;
  const bottomRank = ranked.length ? Math.max(...ranked.map((x) => x.rank!)) : null;
  const names = (rank: number | null) => ranked.filter((x) => x.rank === rank).map((x) => regionLabel(x.r));
  const counts = { up: 0, down: 0, same: 0 };
  rows.forEach((x) => {
    const c = compareToNational(x.v, national, metric);
    if (c) counts[c] += 1;
  });
  const excluded = rows.length - ranked.length;
  const tieGroups = Object.entries(
    ranked.reduce<Record<number, string[]>>((acc, x) => ((acc[x.rank!] ??= []).push(regionLabel(x.r)), acc), {}),
  ).filter(([, list]) => list.length > 1);
  const first = names(topRank);
  const last = names(bottomRank);
  const findings: string[] = [];
  findings.push(`전국 기준 ${metricName}: ${o.format(national)}`);
  if (ranked.length) {
    findings.push(`가장 높은 지역: ${first.join('·')} ${o.format(ranked.find((x) => x.rank === topRank)!.v)}${first.length > 1 ? ` (${first.length}개 지역 공동 1위)` : ''}`);
    findings.push(`가장 낮은 지역: ${last.join('·')} ${o.format(ranked.find((x) => x.rank === bottomRank)!.v)}${last.length > 1 ? ` (${last.length}개 지역 공동 ${bottomRank}위)` : ''}`);
  }
  findings.push(
    `전국보다 높은 지역 ${counts.up}곳 · 낮은 지역 ${counts.down}곳${counts.same ? ` · 같은 지역 ${counts.same}곳` : ''}${excluded ? ` · 계산 제외 ${excluded}곳(0건·분모 0)` : ''}`,
  );
  if (tieGroups.length) findings.push(`공동 순위: ${tieGroups.map(([rank, list]) => `${rank}위 ${list.join('·')}`).join(', ')}`);
  if (selected) findings.push(narrate(data, selected, metric, type, { typeName })[0]);

  // 전국 기준값을 실제 분자·분모로 풀어 보여 줍니다(API가 준 값을 그대로 표시, 새 계산 없음).
  const nat = data.national;
  const natType = nat.type_mix.find((x) => x.charger_type_code === type);
  const natExample =
    metric === 'high_100kw'
      ? `${fmtInt(nat.high_100kw.numerator ?? 0)}기 ÷ ${fmtInt(nat.high_100kw.denominator ?? 0)}기 × 100 = ${o.format(national)}`
      : metric === 'chargers_per_station'
        ? `${fmtInt(nat.chargers_per_station.numerator ?? 0)}기 ÷ ${fmtInt(nat.chargers_per_station.denominator ?? 0)}곳 = ${o.format(national)}`
        : metric === 'type_mix'
          ? `${fmtInt(natType?.charger_count ?? 0)}기 ÷ ${fmtInt(nat.chargers_per_station.numerator ?? 0)}기 × 100 = ${o.format(national)}`
          : metric === 'operator_hhi'
            ? `전국 운영기관 ${fmtInt(nat.operator_hhi.operator_count ?? 0)}개의 점유율로 계산 = ${o.format(national)}`
            : `${fmtInt(nat.deletion_share.numerator ?? 0)}기 ÷ ${fmtInt(nat.deletion_share.denominator ?? 0)}기 × 100 = ${o.format(national)}`;
  const tech: [string, string | undefined][] = [
    ['계산 규칙', meta?.metric_rules?.[metric]],
    ['전국 기준', meta?.national_basis],
    ['순위', meta?.ranking_policy],
    ['지역 필터', meta?.region_filter_policy],
    ...(metric === 'deletion_share'
      ? ([
          ['삭제 표시 필터', meta?.deletion_share_policy],
          ['삭제 표시 안내', meta?.deletion_warning],
        ] as [string, string | undefined][])
      : []),
  ];
  const method = (
    <>
      <dl className="evidence-method-list">
        <div>
          <dt>계산식</dt>
          <dd>{def.formula}</dd>
        </div>
        <div>
          <dt>분자</dt>
          <dd>{def.numerator}</dd>
        </div>
        <div>
          <dt>분모</dt>
          <dd>{def.denominator}</dd>
        </div>
        <div>
          <dt>전국 기준값</dt>
          <dd>
            16개 지역 값의 평균이 아닙니다. 전국의 분자와 분모를 각각 모두 더한 뒤 나눕니다
            {metric === 'operator_hhi' ? '(전국 HHI는 전국 운영기관별 충전기 수로 다시 계산)' : ''}. 현재 전국 값: <span className="num">{natExample}</span>
          </dd>
        </div>
        <div>
          <dt>순위</dt>
          <dd>값이 큰 지역이 1위입니다. 값이 같으면 같은 순위를 주고 다음 순위는 그 수만큼 건너뜁니다. 충전기 0기나 분모 0으로 값이 없는 지역은 순위에서 뺍니다.</dd>
        </div>
        <div>
          <dt>지역 필터</dt>
          <dd>
            16개 지역 비교에는 적용하지 않고, 선택 지역 강조와 지도에만 씁니다.{metric === 'deletion_share' ? ' 이 지표에는 상단 삭제 표시 필터도 적용하지 않습니다.' : ''}
          </dd>
        </div>
      </dl>
      <details className="evidence-tech">
        <summary>기술 상세 · API 원문</summary>
        <dl className="evidence-tech-list">
          {tech
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  <code>{v}</code>
                </dd>
              </div>
            ))}
          <div>
            <dt>원자료 필드</dt>
            <dd>
              {def.fields.map((f) => (
                <code key={f}>{f}</code>
              ))}
            </dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>
              <code>GET /api/regional-disparity</code>
            </dd>
          </div>
        </dl>
      </details>
    </>
  );
  const purpose = `${def.definition}${metric === 'type_mix' ? ` 선택 유형: ${type}${typeName ? ` ${typeName}` : ''}.` : ''} 16개 지역의 값을 전국 기준과 비교해 지역 간 구성 차이를 봅니다.`;
  return (
    <Insight
      mode="dynamic"
      modeNote="현재 필터 결과로 계산 · 16개 지역 비교"
      purpose={purpose}
      reason="지역 간 크기 순서는 막대그래프, 전국 기준과의 차이 방향·크기는 히트맵, 정확한 값과 분모는 순위표로 확인할 수 있게 함께 배치했습니다."
      findings={findings}
      interpretation={`${metricName}의 지역 간 차이는 충전 인프라 공급 구성의 차이입니다. 값이 높거나 낮은 것을 좋고 나쁨으로 평가하지 않으며, 충전 수요나 충전소 부족을 나타내지도 않습니다.`}
      caution={`${def.caution} 전국 대비 차이는 화면에서 뺄셈(지역 값 − 전국 값)으로만 구하며, 표시 단위(${o.diffUnit})로 반올림해 0이면 '같음'으로 봅니다. 충전 수요·인구·전기차 등록 대수를 반영한 지표가 아닙니다.`}
      source={`${CH_SRC}, /api/regional-disparity`}
      variables={def.variables}
      method={method}
    />
  );
}

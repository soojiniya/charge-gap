import type { DisparityMetricKey, RegionalDisparityData, RegionalDisparityMeta } from '../api/types';
import {
  DISPARITY_OPTIONS,
  DISPARITY_DEFS,
  compareToNational,
  denomBasis,
  denomUnit,
  denominator,
  diffFor,
  diffText,
  metricValue,
  narrate,
  nationalValue,
  rankOf,
  regionLabel,
} from '../analysis/disparity';
import { parseSource, type SourceParts } from '../analysis/sourceParts';

export const CHARGER_SNAPSHOT_DATE = '2026-10-15';

const KOREAN_METRIC_RULES: Record<DisparityMetricKey, string> = {
  high_100kw: '출력값이 양수인 충전기 중 100kW 이상인 충전기 수의 비중입니다. 출력 누락·0 이하·숫자가 아닌 값은 계산에서 제외합니다.',
  chargers_per_station: '지역별 충전기 수를 지역 내 고유 충전소 ID(statId) 수로 나눈 값입니다.',
  type_mix: '선택한 충전기 유형의 수를 지역 내 전체 충전기 수로 나눈 비중입니다.',
  operator_hhi: '운영기관 ID와 명칭별 충전기 수를 집계하고, 기관별 충전기 점유율(%)을 제곱해 합산합니다. 값의 범위는 0~10,000점입니다.',
  deletion_share: '삭제 표시 충전기 수를 삭제 상태가 확인된 전체 충전기 수로 나눈 비중입니다. 삭제 상태 필터는 이 지표 계산에서 제외합니다.',
};

const KOREAN_NATIONAL_BASIS = '전국 값은 지역별 비율의 평균이 아닙니다. 전국 분자와 분모를 각각 합산해 계산하며, HHI는 전국 운영기관별 충전기 집계를 바탕으로 별도 계산합니다.';

export interface DisparityExportContext {
  data: RegionalDisparityData;
  meta?: RegionalDisparityMeta;
  metric: DisparityMetricKey;
  type: string;
  typeName?: string;
  selectedRegionCode?: string;
  filters: string[];
  source: string;
  /**
   * 보고서 인쇄용 CSS의 같은 출처 URL. 보고서 창은 사이트 CSP(style-src 'self')를 물려받아 인라인 <style>이 막히므로
   * 스타일은 이 파일을 <link>로 불러옵니다. 없으면(단위 테스트 등) 스타일 링크를 넣지 않습니다.
   */
  stylesheetHref?: string;
  /** 보고서 생성 시점(테스트용으로 고정 가능). 기본: 지금 */
  generatedAt?: Date;
}

export function metricTitle(metric: DisparityMetricKey, type: string, typeName?: string) {
  const option = DISPARITY_OPTIONS.find((item) => item.key === metric)!;
  return metric === 'type_mix' ? `유형 ${type}${typeName ? ` ${typeName}` : ''} 비중` : option.short;
}

function orderedRows(data: RegionalDisparityData, metric: DisparityMetricKey, type: string) {
  return data.regions
    .map((row) => ({ ...row, value: metricValue(row, metric, type) }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.region_code.localeCompare(b.region_code));
}

function rankLabel(data: RegionalDisparityData, row: RegionalDisparityData['regions'][number], metric: DisparityMetricKey, type: string) {
  const rank = rankOf(row, metric, type);
  if (rank == null) return '—';
  const ties = data.regions.filter((candidate) => rankOf(candidate, metric, type) === rank).length;
  return ties > 1 ? `${rank}위 (${ties}개 지역 공동)` : `${rank}위`;
}

function csvCell(value: unknown) {
  const text = value == null ? '—' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildDisparityCsv(context: DisparityExportContext) {
  const { data, metric, type, typeName, selectedRegionCode, filters } = context;
  const option = DISPARITY_OPTIONS.find((item) => item.key === metric)!;
  const title = metricTitle(metric, type, typeName);
  const national = nationalValue(data, metric, type);
  const rows = orderedRows(data, metric, type);
  const effectiveFilters = filters.length ? filters.join(' · ') : '없음';
  const header = ['지역 코드', '지역명', '분석 지표', '지표값', '단위', '전국 기준값', '전국 대비 차이', '차이 단위', '순위', '선택 지역', '분모 기준', '적용 필터', '지역 필터', '자료 기준일'];
  const lines = [header, ...rows.map((row) => {
    const value = row.value ?? null;
    const delta = diffFor(value, national);
    const denominatorValue = denominator(row, metric, type);
    const filterText = metric === 'deletion_share' && filters.some((x) => x.startsWith('삭제 상태:'))
      ? `${effectiveFilters} (삭제 표시 비중 계산에서는 삭제 상태 필터 제외)`
      : effectiveFilters;
    return [
      row.region_code,
      regionLabel(row),
      title,
      option.format(value),
      option.unit,
      option.format(national),
      diffText(delta, option),
      option.diffUnit,
      rankLabel(data, row, metric, type),
      row.region_code === selectedRegionCode ? '선택' : '',
      `${denomBasis(metric)} (${denominatorValue == null ? '—' : `${denominatorValue.toLocaleString('ko-KR')}${denomUnit(metric)}`})`,
      filterText,
      '미적용 (16개 지역 비교)',
      CHARGER_SNAPSHOT_DATE,
    ];
  })];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`;
}

function escapeHtml(input: unknown) {
  return String(input ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

type Cell = string | { text: string; cls?: string; html?: string };

/** 표: 머리글은 속성 없는 <th>로 두고(정렬은 CSS 열 위치로), 셀은 class로 숫자 정렬을 지정합니다. */
function renderTable(headers: string[], rows: Cell[][], opts: { cls?: string; cols?: string[]; rowCls?: (i: number) => string } = {}) {
  const colgroup = opts.cols ? `<colgroup>${opts.cols.map((c) => `<col class="${c}">`).join('')}</colgroup>` : '';
  const cell = (c: Cell) => (typeof c === 'string' ? `<td>${escapeHtml(c)}</td>` : `<td${c.cls ? ` class="${c.cls}"` : ''}>${c.html ?? escapeHtml(c.text)}</td>`);
  return `<table${opts.cls ? ` class="${opts.cls}"` : ''}>${colgroup}<thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row, i) => `<tr${opts.rowCls?.(i) ? ` class="${opts.rowCls(i)}"` : ''}>${row.map(cell).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

/** 막대: 인라인 style 대신 SVG 속성(CSP 허용)으로 길이를 그립니다. 길이 = 값 ÷ 표 안 최댓값(웹 막대와 같은 기준). */
function barSvg(value: number | null | undefined, max: number, national: number | null | undefined) {
  const pct = value == null || max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const mark = national == null || max <= 0 ? null : Math.max(0, Math.min(100, (national / max) * 100));
  return `<svg class="rpt-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="track" x="0" y="2" width="100" height="6"/><rect class="fill" x="0" y="2" width="${pct.toFixed(2)}" height="6"/>${
    mark == null ? '' : `<rect class="mark" x="${Math.max(0, mark - 0.4).toFixed(2)}" y="0" width="0.8" height="10"/>`
  }</svg>`;
}

const signClass = (n: number | null) => (n == null ? '' : n > 0 ? ' up' : n < 0 ? ' down' : '');

/** 출처 문자열 → 분석 자료와 참고 자료(비결합)로 나눔. 형식이 다르면 원문을 그대로 표시합니다. */
function splitSources(source: string): { main: SourceParts; reference?: SourceParts } {
  const main = parseSource(source);
  const refMatch = main.apiNote?.match(/^· 참고\(비결합\): (.+)$/);
  if (refMatch) {
    const reference = parseSource(refMatch[1]);
    return { main: { ...main, apiNote: undefined }, reference };
  }
  return { main };
}

function sourceCard(title: string, tag: string, parts: SourceParts) {
  if (!parts.items?.length) return `<div class="rpt-source"><h4>${escapeHtml(title)}<small>${escapeHtml(tag)}</small></h4><p class="raw">${escapeHtml(parts.name)}${parts.date ? ` ${escapeHtml(parts.date)}` : ''}${parts.api ? ` · ${escapeHtml(parts.api)}` : ''}${parts.apiNote ? ` ${escapeHtml(parts.apiNote)}` : ''}</p></div>`;
  const label: Record<string, string> = { 작성기관: '작성기관', 제공: '제공 창구', '자료 기준': '자료 기준', '파일 저장': '파일 저장일', 조회: '조회 시각', '이용 조건': '이용 조건' };
  const rows: [string, string][] = [['기관', parts.name], ...parts.items.map((it): [string, string] => [it.label ? (label[it.label] ?? it.label) : '데이터명', it.value])];
  if (parts.api) rows.push(['API', parts.api]);
  if (parts.apiNote) rows.push(['비고', parts.apiNote]);
  return `<div class="rpt-source"><h4>${escapeHtml(title)}<small>${escapeHtml(tag)}</small></h4><dl>${rows
    .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
    .join('')}</dl></div>`;
}

export function buildDisparityReportHtml(context: DisparityExportContext) {
  const { data, meta, metric, type, typeName, selectedRegionCode, filters, source, stylesheetHref } = context;
  const generatedAt = context.generatedAt ?? new Date();
  const option = DISPARITY_OPTIONS.find((item) => item.key === metric)!;
  const def = DISPARITY_DEFS[metric];
  const title = metricTitle(metric, type, typeName);
  const national = nationalValue(data, metric, type);
  const rows = orderedRows(data, metric, type);
  const selected = data.regions.find((row) => row.region_code === selectedRegionCode);
  const effectiveFilters = filters.length ? filters.join(' · ') : '유형·운영기관·삭제 상태 필터 없음';
  const nationalBasisDetail = metric === 'operator_hhi'
    ? `전국 운영기관 ID·명칭 조합 ${data.national.operator_hhi.operator_count?.toLocaleString('ko-KR') ?? '—'}개 그룹의 충전기 점유율로 별도 재계산`
    : metric === 'type_mix'
      ? `선택 유형 ${data.national.type_mix.find((item) => item.charger_type_code === type)?.charger_count.toLocaleString('ko-KR') ?? '0'}기 / 전국 충전기 ${data.national.chargers_per_station.numerator?.toLocaleString('ko-KR') ?? '—'}기`
      : metric === 'high_100kw'
        ? `100kW 이상 ${data.national.high_100kw.numerator?.toLocaleString('ko-KR') ?? '—'}기 / 출력 확인 ${data.national.high_100kw.denominator?.toLocaleString('ko-KR') ?? '—'}기`
        : metric === 'chargers_per_station'
          ? `충전기 ${data.national.chargers_per_station.numerator?.toLocaleString('ko-KR') ?? '—'}기 / 고유 충전소 ${data.national.chargers_per_station.denominator?.toLocaleString('ko-KR') ?? '—'}곳`
          : `삭제 표시 ${data.national.deletion_share.numerator?.toLocaleString('ko-KR') ?? '—'}기 / 삭제 상태 전체 ${data.national.deletion_share.denominator?.toLocaleString('ko-KR') ?? '—'}기`;
  const ranked = rows.filter((row) => rankOf(row, metric, type) != null);
  const chosenRank = selected ? rankLabel(data, selected, metric, type) : null;
  const chosenNarrative = selected ? narrate(data, selected, metric, type, { typeName }).join(' ') : '';

  /* ---- 핵심 사실(모두 API 값·순위에서 직접 확인되는 것만) ---- */
  const rankNums = ranked.map((row) => rankOf(row, metric, type)!);
  const topRank = rankNums.length ? Math.min(...rankNums) : null;
  const bottomRank = rankNums.length ? Math.max(...rankNums) : null;
  const atRank = (rank: number | null) => ranked.filter((row) => rankOf(row, metric, type) === rank);
  const top = atRank(topRank);
  const bottom = atRank(bottomRank);
  const counts = { up: 0, down: 0, same: 0 };
  rows.forEach((row) => {
    const c = compareToNational(row.value, national, metric);
    if (c) counts[c] += 1;
  });
  const excluded = rows.length - ranked.length;
  const names = (list: typeof rows) => list.map((row) => regionLabel(row)).join('·');
  const findings: string[] = [];
  if (top.length) findings.push(`가장 높은 지역은 ${names(top)} ${option.format(top[0].value)}${top.length > 1 ? `(${top.length}개 지역 공동 1위)` : ''}입니다.`);
  if (bottom.length && bottomRank !== topRank) findings.push(`가장 낮은 지역은 ${names(bottom)} ${option.format(bottom[0].value)}${bottom.length > 1 ? `(${bottom.length}개 지역 공동 ${bottomRank}위)` : ''}입니다.`);
  findings.push(`전국 기준보다 높은 지역 ${counts.up}곳, 낮은 지역 ${counts.down}곳${counts.same ? `, 같은 지역 ${counts.same}곳` : ''}입니다.${excluded ? ` ${excluded}개 지역은 충전기 0기 또는 분모 0으로 계산·순위에서 제외했습니다.` : ''}`);
  if (top.length && bottom.length && bottomRank !== topRank && top[0].value != null && bottom[0].value != null)
    findings.push(`최고 지역과 최저 지역의 차이는 ${diffText(top[0].value - bottom[0].value, option).slice(1)}입니다.`);
  const ties = Object.values(
    ranked.reduce<Record<number, string[]>>((acc, row) => ((acc[rankOf(row, metric, type)!] ??= []).push(regionLabel(row)), acc), {}),
  ).filter((list) => list.length > 1);
  if (ties.length) findings.push(`같은 값으로 공동 순위인 지역: ${ties.map((list) => list.join('·')).join(', ')}.`);

  const selectedValue = selected ? metricValue(selected, metric, type) : null;
  const selectedDiff = selected ? diffFor(selectedValue, national) : null;
  const kpis = `<dl class="rpt-kpis keep">
<div class="rpt-kpi is-key"><dt>전국 기준값 · ${escapeHtml(title)}</dt><dd><span class="v num">${escapeHtml(option.format(national))}</span><span class="s">전국 기준 산정: ${escapeHtml(nationalBasisDetail)}</span></dd></div>
${selected
    ? `<div class="rpt-kpi"><dt>선택 지역 · ${escapeHtml(regionLabel(selected))}</dt><dd><span class="v num">${escapeHtml(option.format(selectedValue))}</span><span class="s">전국 대비 <b class="num${signClass(selectedDiff)}">${escapeHtml(diffText(selectedDiff, option))}</b> · ${chosenRank == null || chosenRank === '—' ? '순위 없음(계산 제외)' : `${ranked.length}개 지역 중 <b>${escapeHtml(chosenRank)}</b>`}</span></dd></div>`
    : `<div class="rpt-kpi"><dt>지역 값 범위 (최저 – 최고)</dt><dd><span class="v num is-range">${bottom.length && top.length ? `${escapeHtml(option.format(bottom[0].value))} – ${escapeHtml(option.format(top[0].value))}` : '—'}</span><span class="s">${top.length ? `최저 ${escapeHtml(names(bottom))} · 최고 ${escapeHtml(names(top))}` : '순위가 산정된 지역 없음'}</span></dd></div>`}
<div class="rpt-kpi"><dt>전국 대비 높음 / 낮음</dt><dd><span class="v num">${counts.up} / ${counts.down}<small>곳</small></span><span class="s">비교 ${data.regions.length}개 지역 · 순위 산정 ${ranked.length}개${counts.same ? ` · 같음 ${counts.same}곳` : ''}${excluded ? ` · 계산 제외 ${excluded}곳` : ''}</span></dd></div>
</dl>`;

  const selectedSummary = selected
    ? `<div class="rpt-selected keep"><h3>선택 지역 분석 · ${escapeHtml(regionLabel(selected))}</h3><p class="rpt-selected-meta">충전기 ${selected.charger_count.toLocaleString('ko-KR')}기 · 충전소 ${selected.station_count.toLocaleString('ko-KR')}곳 · ${chosenRank == null || chosenRank === '—' ? '순위 없음(계산 제외)' : `${ranked.length}개 지역 중 ${escapeHtml(chosenRank)}`}</p><p class="rpt-selected-text">${escapeHtml(chosenNarrative)}</p>
<h3>선택 지역의 5개 지표</h3>${renderTable(
        ['요약 지표', '값', '전국 대비 차이', '순위'],
        DISPARITY_OPTIONS.map((item) => {
          const value = metricValue(selected, item.key, type);
          const base = nationalValue(data, item.key, type);
          const d = diffFor(value, base);
          return [metricTitle(item.key, type, typeName), { text: item.format(value), cls: 'n' }, { text: diffText(d, item), cls: `n${signClass(d)}` }, { text: rankLabel(data, selected, item.key, type), cls: 'n' }];
        }),
        { cls: 'rpt-mini' },
      )}</div>`
    : '<p class="rpt-note">선택된 지역이 없습니다. 웹 화면에서 지역을 선택하면 해당 지역의 상세 요약이 보고서에 포함됩니다.</p>';

  const deletionNote = metric === 'deletion_share'
    ? '<p class="rpt-note is-warn">삭제 표시 비중은 삭제 상태 필터를 제외한 모집단에서 계산합니다. 삭제 표시는 자료상 분류이며 실제 고장이나 이용 불가를 뜻하지 않습니다.</p>'
    : '';

  /* ---- 16개 지역 비교 표: 전국 기준 행을 맨 위에 두고 같은 열로 비교 ---- */
  const max = Math.max(0, national ?? 0, ...rows.map((row) => row.value ?? 0));
  const nationalDen = metric === 'high_100kw' ? data.national.high_100kw.denominator
    : metric === 'chargers_per_station' ? data.national.chargers_per_station.denominator
      : metric === 'deletion_share' ? data.national.deletion_share.denominator
        : metric === 'operator_hhi' ? data.national.operator_hhi.operator_count
          : data.national.chargers_per_station.numerator;
  const tableRows: Cell[][] = [
    [{ text: '기준', cls: 'rank' }, { text: '전국', cls: 'region' }, { text: option.format(national), cls: 'n' }, { text: '', html: barSvg(national, max, national) }, { text: '—', cls: 'n muted' }, { text: nationalDen == null ? '—' : `${nationalDen.toLocaleString('ko-KR')}${denomUnit(metric)}`, cls: 'n' }],
    ...rows.map((row): Cell[] => {
      const rank = rankOf(row, metric, type);
      const tiesAt = rank == null ? 0 : data.regions.filter((candidate) => rankOf(candidate, metric, type) === rank).length;
      const d = diffFor(row.value, national);
      const den = denominator(row, metric, type);
      return [
        { text: rank == null ? '—' : `${rank}위`, cls: 'rank', html: rank == null ? '—' : `${rank}위${tiesAt > 1 ? `<small>${tiesAt}개 지역 공동</small>` : ''}` },
        { text: regionLabel(row), cls: 'region' },
        { text: option.format(row.value), cls: 'n' },
        { text: '', html: barSvg(row.value, max, national) },
        { text: diffText(d, option), cls: `n${signClass(d)}` },
        { text: den == null ? '—' : `${den.toLocaleString('ko-KR')}${denomUnit(metric)}`, cls: 'n' },
      ];
    }),
  ];
  const comparison = renderTable(
    ['순위', '지역', `${title} (${option.unit})`, '지역 값 막대', `전국 대비 차이 (${option.diffUnit})`, `분모 (${denomBasis(metric)})`],
    tableRows,
    {
      cls: 'rpt-compare',
      cols: ['c-rank', 'c-region', 'c-value', 'c-bar', 'c-diff', 'c-den'],
      rowCls: (i) => (i === 0 ? 'is-national' : rows[i - 1].region_code === selectedRegionCode ? 'is-selected' : ''),
    },
  );

  /* ---- 해석 주의사항: 항목별 ---- */
  const warnings = [...(meta?.warnings ?? []), meta?.deletion_warning, meta?.same_period_shortage_rate_computed === false ? '전기차 등록과 충전기 자료는 기준 시점이 달라 같은 시점의 비율이나 충전 부족률을 계산하지 않습니다.' : undefined].filter(Boolean) as string[];
  // 항목별 주의사항. 같은 내용이 보고서 다른 곳(02 표 설명, 계산식 정의)이나 API 경고에 이미 있으면 다시 넣지 않습니다.
  const cautions = [
    '지역 간 차이는 충전 인프라 구성의 상대적 차이이며 실제 충전 수요 대비 부족이나 공급 부족을 뜻하지 않습니다.',
    def.caution,
    ...warnings,
    ...(warnings.some((w) => /시점/.test(w))
      ? []
      : [`전기차 등록 자료(2026년 9월 말)와 충전기 조회 자료(${CHARGER_SNAPSHOT_DATE})는 기준 시점이 다르므로 하나의 시점으로 결합해 해석하지 않습니다.`]),
  ];

  const { main: mainSource, reference: refSource } = splitSources(source);
  const generated = generatedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const queried = mainSource.items?.find((it) => it.label === '조회')?.value ?? `${CHARGER_SNAPSHOT_DATE} 조회`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CHARGE GAP · ${escapeHtml(title)} · ${CHARGER_SNAPSHOT_DATE}</title>${
    stylesheetHref ? `<link rel="stylesheet" href="${escapeHtml(stylesheetHref)}" data-report-style>` : ''
  }</head><body>
<header class="rpt-head"><div class="rpt-brand"><b>CHARGE GAP</b><span>분석 보고서 · 자료 기준 ${CHARGER_SNAPSHOT_DATE}</span></div>
<h1>전국 충전 인프라 구성 격차 분석</h1><p class="rpt-subtitle">16개 시도 충전기 구성 비교 · ${escapeHtml(title)}</p>
<dl class="rpt-meta">
<div><dt>데이터 기준일</dt><dd>충전기 조회 ${CHARGER_SNAPSHOT_DATE}</dd></div>
<div><dt>분석 지표</dt><dd>${escapeHtml(title)} (${escapeHtml(option.unit)})</dd></div>
<div><dt>분모 기준</dt><dd>${escapeHtml(denomBasis(metric))}</dd></div>
<div><dt>현재 적용 필터</dt><dd>${escapeHtml(effectiveFilters)}${metric === 'deletion_share' ? ' · 삭제 상태 필터는 이 지표에서 제외' : ''}</dd></div>
<div><dt>지역 필터</dt><dd>16개 지역 비교에는 적용되지 않음 (선택 지역은 표시만 함)</dd></div>
<div><dt>비교 지역 / 유효 순위</dt><dd>${data.regions.length}개 지역 / ${ranked.length}개 지역 순위 산정</dd></div>
</dl></header>

<section class="rpt-section"><h2><span class="no">01</span>핵심 분석 요약</h2>${kpis}
<ul class="rpt-findings">${findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>${deletionNote}${selectedSummary}</section>

<section class="rpt-section rpt-page-compare"><h2><span class="no">02</span>16개 지역 비교 및 순위</h2><p class="rpt-lead">전국 대비 차이는 지역 값에서 전국 합산 기준값을 뺀 값입니다. 동률은 API 순위를 그대로 표시하고, 값이 없거나 분모가 0이면 —로 표시합니다.</p>${comparison}
<p class="rpt-legend"><span><i></i>지역 값 (막대 길이 = 값 ÷ 표 안 최댓값)</span><span><i class="mark"></i>전국 기준값 위치</span><span>맨 위 행: 전국 기준</span></p></section>

<section class="rpt-section rpt-page-method"><h2><span class="no">03</span>계산 방법 및 해석</h2>
<div class="rpt-formula keep"><dl class="f-main"><dt>계산식</dt><dd>${escapeHtml(def.formula)}</dd></dl><dl class="f-parts"><div><dt>분자</dt><dd>${escapeHtml(def.numerator)}</dd></div><div><dt>분모</dt><dd>${escapeHtml(def.denominator)}</dd></div></dl></div>
<dl class="rpt-defs">
<div><dt>정의</dt><dd><strong>${escapeHtml(def.definition)}</strong></dd></div>
<div><dt>계산 규칙</dt><dd>${escapeHtml(KOREAN_METRIC_RULES[metric])}</dd></div>
<div><dt>전국 기준값</dt><dd>${escapeHtml(KOREAN_NATIONAL_BASIS)} 현재 전국 값: <span class="num">${escapeHtml(option.format(national))}</span> (${escapeHtml(nationalBasisDetail)})</dd></div>
<div><dt>순위</dt><dd>값이 큰 지역이 1위입니다. 값이 같으면 같은 순위를 주고, 값이 없는 지역(충전기 0기·분모 0)은 순위에서 제외합니다.</dd></div>
<div><dt>지역 필터</dt><dd>16개 지역 비교에는 적용하지 않고 선택 지역 표시에만 씁니다.${metric === 'deletion_share' ? ' 이 지표에는 삭제 상태 필터도 적용하지 않습니다.' : ''}</dd></div>
</dl>
<h3>해석 주의사항</h3><ol class="rpt-cautions">${cautions.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ol></section>

<section class="rpt-section rpt-source-section"><h2><span class="no">04</span>데이터 출처 및 분석 한계</h2>
<div class="rpt-sources">${sourceCard('분석 자료', '이 보고서의 모든 수치', mainSource)}${refSource ? sourceCard('참고 자료', '결합하지 않음', refSource) : ''}</div>
<div class="rpt-closing"><ul class="rpt-limits"><li>공급 측 충전기 자료만으로 계산한 구성 지표입니다. 인구·전기차 등록 대수·이용량 등 수요 자료는 결합하지 않았습니다.</li><li>보고서는 현재 웹 화면에서 받은 API 응답을 사용하며, 데이터 재수집은 수행하지 않습니다. 화면의 현재 분석 조건을 반영한 조회 시점 스냅샷입니다.</li></ul>
<dl class="rpt-times"><div><dt>충전기 자료 기준·조회 시점</dt><dd>${CHARGER_SNAPSHOT_DATE} · 조회 ${escapeHtml(queried)}</dd></div><div><dt>보고서 생성 시점</dt><dd>${escapeHtml(generated)} (KST)</dd></div></dl></div>
</section>
</body></html>`;
}

/**
 * 보고서 창의 스타일시트와 글꼴이 준비될 때까지 기다립니다(최대 timeoutMs). 인쇄 전에 호출해
 * 스타일 없는 화면이 PDF로 저장되지 않게 합니다. 실패해도 인쇄는 진행할 수 있도록 항상 resolve합니다.
 */
export function whenReportReady(doc: Document, timeoutMs = 4000): Promise<void> {
  const link = doc.querySelector<HTMLLinkElement>('link[data-report-style]');
  const styleLoaded = !link || link.sheet
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => resolve(), { once: true });
      });
  const fonts = () => (doc.fonts ? doc.fonts.ready.then(() => undefined) : Promise.resolve());
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([styleLoaded.then(fonts), timeout]);
}

export function disparityExportFilename(metric: DisparityMetricKey, type: string, extension: 'csv' | 'pdf') {
  const metricPart = metric === 'type_mix' ? `type-mix-${type}` : metric.replace(/_/g, '-');
  return `charge-gap-${metricPart}-${CHARGER_SNAPSHOT_DATE}.${extension}`;
}

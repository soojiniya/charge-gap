/**
 * 두 지역 비교: 계산과 분석 문장.
 * 원칙
 *  - 전기차 등록은 2026-09 자료끼리, 충전 인프라는 2026-10-15 자료끼리만 비교합니다.
 *  - 서로 다른 기준일의 등록 대수와 충전기 수를 나눈 지표(차량당 충전기, 부족률 등)는 만들지 않습니다.
 *  - 삭제 표시(delYn)는 자료상 표기일 뿐 실제 이용 가능 여부가 아닙니다.
 *  - 0으로 나누거나 값이 없으면 null을 돌려주고 화면은 '—'로 표시합니다.
 * 모든 수치는 인자로 받은 실제 API 응답에서 계산합니다.
 */
import type { ReactNode } from 'react';
import type { ChargerOutputRow, ChargerRegionRow, ChargerTypeRow, EvRegistrationRow, OperatorRow, StationSizeRow } from '../api/types';
import type { InsightProps } from '../components/ui/Insight';
import { fmtInt, fmtPct } from '../lib/format';
import { CH_SRC, EV_SRC } from './dataSources';

/* ---------------- 공통 계산 ---------------- */

/** 안전한 나눗셈: 분모가 0 이하이거나 값이 유한하지 않으면 null */
export function ratio(n: number | null | undefined, d: number | null | undefined): number | null {
  if (n === null || n === undefined || d === null || d === undefined) return null;
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}
/** 비중(%) */
export function share(n: number | null | undefined, d: number | null | undefined): number | null {
  const r = ratio(n, d);
  return r === null ? null : r * 100;
}
/** 두 비중의 차이(%p, B − A) */
export function ppDiff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : b - a;
}
/** 큰 값이 작은 값의 몇 배인지. 둘 다 양수일 때만 계산 */
export function times(a: number | null, b: number | null): { larger: 'a' | 'b' | 'same'; x: number } | null {
  if (a === null || b === null || !(a > 0) || !(b > 0)) return null;
  if (a === b) return { larger: 'same', x: 1 };
  return a > b ? { larger: 'a', x: a / b } : { larger: 'b', x: b / a };
}
export interface Rank {
  rank: number;
  tied: boolean;
  of: number;
}
/** 내림차순 순위(공동 순위: 더 큰 값의 개수 + 1). 값이 없는 항목은 순위 대상에서 제외 */
export function rankDesc(items: { code: string; value: number | null }[], code: string): Rank | null {
  const valid = items.filter((i) => i.value !== null && Number.isFinite(i.value)) as { code: string; value: number }[];
  const me = valid.find((i) => i.code === code);
  if (!me) return null;
  const higher = valid.filter((i) => i.value > me.value).length;
  const tied = valid.filter((i) => i.value === me.value).length > 1;
  return { rank: higher + 1, tied, of: valid.length };
}

/* ---------------- URL 요청변수 ---------------- */

export const COMPARE_KEYS = { a: 'cmp_a', b: 'cmp_b' } as const;

/**
 * cmp_a·cmp_b 해석. 허용된 지역 코드만 받고, 잘못된 값은 remove에 담아 URL에서 지웁니다.
 * 두 값이 같으면 지역 B를 비우고 same=true로 안내합니다.
 */
export function parseCompareParams(params: URLSearchParams, allowed: readonly string[]) {
  const remove: string[] = [];
  const pick = (key: string) => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    if (allowed.includes(raw)) return raw;
    remove.push(key);
    return undefined;
  };
  const a = pick(COMPARE_KEYS.a);
  let b = pick(COMPARE_KEYS.b);
  let same = false;
  if (a !== undefined && b !== undefined && a === b) {
    same = true;
    b = undefined;
    remove.push(COMPARE_KEYS.b);
  }
  return { a, b, remove, same };
}

/* ---------------- 지역 이름 ---------------- */

/** 비교 화면 표기: 12는 짧게 '전남광주'(광주+전남 통합 사실은 선택 상자·주의사항에 표시) */
export const compareName = (code: string, name: string) => (code === '12' ? '전남광주' : name);

/* ---------------- 전기차 등록 (2026-09) ---------------- */

export const EV_TYPES = [
  { key: 'ev_passenger_count', label: '승용' },
  { key: 'ev_truck_count', label: '화물' },
  { key: 'ev_bus_count', label: '승합' },
  { key: 'ev_special_count', label: '특수' },
] as const;

export interface EvSide {
  code: string;
  name: string;
  count: number;
  nationShare: number | null;
  rank: Rank | null;
  types: { key: string; label: string; count: number; pct: number | null }[];
  commercial: number;
  commercialPct: number | null;
  commercialRank: Rank | null;
  commercialVsNationPp: number | null;
}
export interface EvCompare {
  a: EvSide;
  b: EvSide;
  nationTotal: number;
  nationCommercialPct: number | null;
  regionCount: number;
}

export function compareEv(rows: EvRegistrationRow[], a: string, b: string): EvCompare | null {
  const nationTotal = rows.reduce((s, r) => s + r.ev_registration_count, 0);
  const nationCommercial = rows.reduce((s, r) => s + r.ev_commercial_count, 0);
  const nationCommercialPct = share(nationCommercial, nationTotal);
  const countItems = rows.map((r) => ({ code: r.region_code, value: r.ev_registration_count }));
  const commItems = rows.map((r) => ({ code: r.region_code, value: share(r.ev_commercial_count, r.ev_registration_count) }));
  const side = (code: string): EvSide | null => {
    const r = rows.find((x) => x.region_code === code);
    if (!r) return null;
    const commercialPct = share(r.ev_commercial_count, r.ev_registration_count);
    return {
      code,
      name: compareName(code, r.region_name),
      count: r.ev_registration_count,
      nationShare: share(r.ev_registration_count, nationTotal),
      rank: rankDesc(countItems, code),
      types: EV_TYPES.map((t) => ({ key: t.key, label: t.label, count: r[t.key], pct: share(r[t.key], r.ev_registration_count) })),
      commercial: r.ev_commercial_count,
      commercialPct,
      commercialRank: rankDesc(commItems, code),
      commercialVsNationPp: ppDiff(nationCommercialPct, commercialPct),
    };
  };
  const sa = side(a);
  const sb = side(b);
  if (!sa || !sb) return null;
  return { a: sa, b: sb, nationTotal, nationCommercialPct, regionCount: rows.length };
}

/* ---------------- 충전 인프라 (2026-10-15) ---------------- */

export interface ChargerSide {
  code: string;
  name: string;
  chargers: number;
  stations: number;
  perStation: number | null;
  deleted: number;
  deletedPct: number | null;
  filteredShare: number | null;
  chargerRank: Rank | null;
  stationRank: Rank | null;
}
export interface ChargerCompare {
  a: ChargerSide;
  b: ChargerSide;
  filteredTotal: number;
  regionCount: number;
}

/** /api/charger-regions 응답(지역 필터 제외, 유형·삭제·기관 필터 적용)으로 비교. 관측이 없는 지역은 0으로 둡니다. */
export function compareChargers(rows: ChargerRegionRow[], allCodes: readonly string[], names: Record<string, string>, a: string, b: string): ChargerCompare {
  const by = new Map(rows.map((r) => [r.region_code, r]));
  const filteredTotal = rows.reduce((s, r) => s + r.charger_count, 0);
  const chargerItems = allCodes.map((c) => ({ code: c, value: by.get(c)?.charger_count ?? 0 }));
  const stationItems = allCodes.map((c) => ({ code: c, value: by.get(c)?.station_count ?? 0 }));
  const side = (code: string): ChargerSide => {
    const r = by.get(code);
    const chargers = r?.charger_count ?? 0;
    const stations = r?.station_count ?? 0;
    const deleted = r?.deleted_charger_count ?? 0;
    return {
      code,
      name: compareName(code, r?.region_name ?? names[code] ?? code),
      chargers,
      stations,
      perStation: ratio(chargers, stations),
      deleted,
      deletedPct: share(deleted, chargers),
      filteredShare: share(chargers, filteredTotal),
      chargerRank: rankDesc(chargerItems, code),
      stationRank: rankDesc(stationItems, code),
    };
  };
  return { a: side(a), b: side(b), filteredTotal, regionCount: allCodes.length };
}

export interface MixRow {
  key: string;
  label: string;
  a: { count: number; pct: number | null };
  b: { count: number; pct: number | null };
  pp: number | null;
}

/** 유형 구성: 두 지역 합계 기준 상위 n개 + 기타. 비중 분모는 각 지역의 충전기 수 */
export function typeMix(rowsA: ChargerTypeRow[], rowsB: ChargerTypeRow[], top = 5): MixRow[] {
  const totalA = rowsA.reduce((s, r) => s + r.charger_count, 0);
  const totalB = rowsB.reduce((s, r) => s + r.charger_count, 0);
  const codes = new Map<string, { label: string; a: number; b: number }>();
  for (const [rows, side] of [[rowsA, 'a'], [rowsB, 'b']] as const) {
    for (const r of rows) {
      const c = codes.get(r.charger_type_code) ?? { label: `${r.charger_type_code} ${r.official_definition}`, a: 0, b: 0 };
      c[side] += r.charger_count;
      codes.set(r.charger_type_code, c);
    }
  }
  const sorted = [...codes.entries()].sort((x, y) => y[1].a + y[1].b - (x[1].a + x[1].b) || x[0].localeCompare(y[0]));
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top);
  const row = (key: string, label: string, a: number, b: number): MixRow => {
    const pa = share(a, totalA);
    const pb = share(b, totalB);
    return { key, label, a: { count: a, pct: pa }, b: { count: b, pct: pb }, pp: ppDiff(pa, pb) };
  };
  const out = head.map(([k, v]) => row(k, v.label, v.a, v.b));
  if (rest.length) {
    out.push(row('etc', `기타 ${rest.length}개 유형`, rest.reduce((s, [, v]) => s + v.a, 0), rest.reduce((s, [, v]) => s + v.b, 0)));
  }
  return out;
}

/** 출력 구간 (그래프 8 히트맵과 같은 경계: 30, 50, 100, 200kW). 미상 = 결측·0 이하·숫자 아님 */
export const OUTPUT_BAND_LABELS = ['30kW 미만', '30–50kW', '50–100kW', '100–200kW', '200kW 이상'] as const;
export function outputBand(r: Pick<ChargerOutputRow, 'value_status' | 'output_kw'>): number {
  if (r.value_status !== 'positive_numeric' || r.output_kw === null) return -1;
  const k = r.output_kw;
  return k < 30 ? 0 : k < 50 ? 1 : k < 100 ? 2 : k < 200 ? 3 : 4;
}
export interface OutputSide {
  valid: number;
  unknown: number;
  bands: number[];
  /** 100kW 이상 비중(%): 분모는 유효 출력(양수) 충전기 */
  high100Pct: number | null;
}
export function outputSide(rows: ChargerOutputRow[]): OutputSide {
  const bands = [0, 0, 0, 0, 0];
  let unknown = 0;
  for (const r of rows) {
    const i = outputBand(r);
    if (i < 0) unknown += r.charger_count;
    else bands[i] += r.charger_count;
  }
  const valid = bands.reduce((s, v) => s + v, 0);
  return { valid, unknown, bands, high100Pct: share(bands[3] + bands[4], valid) };
}
export function outputMix(a: OutputSide, b: OutputSide): MixRow[] {
  return OUTPUT_BAND_LABELS.map((label, i) => {
    const pa = share(a.bands[i], a.valid);
    const pb = share(b.bands[i], b.valid);
    return { key: label, label, a: { count: a.bands[i], pct: pa }, b: { count: b.bands[i], pct: pb }, pp: ppDiff(pa, pb) };
  });
}

export const pickStation = (rows: StationSizeRow[], code: string) => rows.find((r) => r.region_code === code) ?? null;

/** 상위 운영기관 n개: 비중 분모는 해당 지역의 필터 일치 충전기 수(API meta.matched) */
export function topOperators(rows: OperatorRow[], matched: number, n = 3) {
  return rows.slice(0, n).map((r) => ({ id: r.operator_id, name: r.operator_name, count: r.charger_count, pct: share(r.charger_count, matched) }));
}

/* ---------------- 표시 ---------------- */

export const fmtP = (v: number | null, d = 1) => (v === null ? '—' : fmtPct(v, d));
export const fmtPp = (v: number | null, d = 1) => {
  if (v === null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toFixed(d);
  return `${Number(abs) === 0 ? '±' : v > 0 ? '+' : '−'}${abs}%p`;
};
export const fmtRank = (r: Rank | null) => (r ? `${r.of}개 중 ${r.rank}위${r.tied ? '(공동)' : ''}` : '—');
/** 받침 유무에 따른 조사: 이/가. 한글이 아니면 '이(가)' */
export function iGa(word: string) {
  const c = word.charCodeAt(word.length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return `${word}이(가)`;
  return (c - 0xac00) % 28 === 0 ? `${word}가` : `${word}이`;
}
export const fmtTimes = (t: ReturnType<typeof times>, na: string, nb: string) =>
  t === null ? null : t.larger === 'same' ? '같은 값' : `${iGa(t.larger === 'a' ? na : nb)} ${t.larger === 'a' ? nb : na}의 ${fmtX(t.x)}배`;
/** 배수 표기: 1.1배 미만은 소수 둘째 자리까지(1.0배로 보이는 차이를 숨기지 않음) */
export const fmtX = (x: number) => x.toFixed(x < 1.1 ? 2 : 1);

/* ---------------- 분석 문장 (Insight) ---------------- */

const B = ({ children }: { children: ReactNode }) => <b>{children}</b>;
const DATE_NOTE =
  '전기차 등록(2026-09)과 충전기(2026-10-15)는 기준 시점이 달라, 등록 대수와 충전기 수를 서로 나눈 지표(차량당 충전기, 충전 부족률 등)는 만들지 않습니다.';

export function insightEvCompare(c: EvCompare): InsightProps {
  const { a, b } = c;
  const tx = times(a.count, b.count);
  const t = fmtTimes(tx, a.name, b.name);
  const diffs = a.types.map((ta, i) => ({ label: ta.label, a: ta.pct, b: b.types[i].pct, pp: ppDiff(ta.pct, b.types[i].pct) }));
  const big = diffs.filter((d) => d.pp !== null).sort((x, y) => Math.abs(y.pp as number) - Math.abs(x.pp as number))[0];
  const commPp = ppDiff(a.commercialPct, b.commercialPct);
  return {
    mode: 'fixed',
    modeNote: '2026-09 등록자료, 순위는 전국 16개 지역 기준 (충전기 필터 미적용)',
    purpose: '두 지역의 전기차 등록 규모·차종 구성·사업용 비중을 같은 기준월(2026-09) 자료로 비교합니다.',
    reason: '두 지역의 같은 지표를 나란히 놓고 차이(%p)·배수·전국 순위를 함께 보여 주는 비교 막대를 사용했습니다.',
    findings: [
      <>
        등록 대수: {a.name} <B>{fmtInt(a.count)}대</B>(전국의 {fmtP(a.nationShare)}, {fmtRank(a.rank)}), {b.name}{' '}
        <B>{fmtInt(b.count)}대</B>(전국의 {fmtP(b.nationShare)}, {fmtRank(b.rank)}){t ? <>. {t}입니다.</> : '.'}
      </>,
      <>
        사업용 비중: {a.name} <B>{fmtP(a.commercialPct)}</B>, {b.name} <B>{fmtP(b.commercialPct)}</B>로 차이 {fmtPp(commPp)}입니다 (전국{' '}
        {fmtP(c.nationCommercialPct)}).
      </>,
      ...(big
        ? [
            <>
              차종 구성에서 차이가 가장 큰 항목은 {big.label}입니다 ({a.name} {fmtP(big.a)}, {b.name} {fmtP(big.b)}, {fmtPp(big.pp)}).
            </>,
          ]
        : []),
    ],
    interpretation: (
      <>
        {t && tx ? (tx.x < 1.1 ? `두 지역의 등록 대수는 비슷한 수준입니다(${t}). ` : `두 지역의 등록 대수는 ${t} 수준으로 규모 차이가 있습니다. `) : ''}
        {commPp !== null && commPp !== 0
          ? `사업용 비중은 ${iGa(commPp > 0 ? b.name : a.name)} ${Math.abs(commPp).toFixed(1)}%p 높습니다. `
          : ''}
        등록 대수는 인구나 전체 차량 수를 반영하지 않은 절대값이므로 보급 수준의 우열로 읽지 않습니다.
      </>
    ),
    caution: `2026년 9월 기준 전기차(하이브리드·수소 제외). 전남광주(12)는 충전기 자료의 전남광주통합특별시(12)와 같은 지역이며 과거 광주·전남으로 나누지 않습니다. ${DATE_NOTE}`,
    source: EV_SRC,
    variables: ['region_code', 'ev_registration_count', 'ev_passenger_count', 'ev_truck_count', 'ev_bus_count', 'ev_special_count', 'ev_commercial_count'],
  };
}

export function insightChargerCompare(c: ChargerCompare, out: { a: OutputSide; b: OutputSide }, filtered: boolean): InsightProps {
  const { a, b } = c;
  const tx = times(a.chargers, b.chargers);
  const t = fmtTimes(tx, a.name, b.name);
  const hiPp = ppDiff(out.a.high100Pct, out.b.high100Pct);
  const rankBasis = filtered ? '필터 적용 16개 지역 기준' : '전국 16개 지역 기준';
  return {
    mode: filtered ? 'dynamic' : 'fixed',
    modeNote: filtered
      ? '2026-10-15 충전기 자료, 유형·삭제 표시·운영기관 필터 적용 (지역 필터 제외), 순위는 필터 적용 16개 지역 기준'
      : '2026-10-15 충전기 자료, 순위는 전국 16개 지역 기준',
    purpose: '두 지역의 충전기·충전소 규모, 충전소당 충전기 수, 고출력 비중, 삭제 표시 비율을 같은 조회일(2026-10-15) 자료로 비교합니다.',
    reason: '두 지역의 같은 지표를 나란히 놓고 차이·배수·순위를 함께 보여 주는 비교 막대를 사용했습니다.',
    findings: [
      <>
        충전기: {a.name} <B>{fmtInt(a.chargers)}기</B>({fmtRank(a.chargerRank)}), {b.name} <B>{fmtInt(b.chargers)}기</B>(
        {fmtRank(b.chargerRank)}, {rankBasis}){t ? <>. {t}입니다.</> : '.'}
      </>,
      <>
        충전소당 충전기: {a.name} <B>{a.perStation === null ? '—' : `${a.perStation.toFixed(2)}기`}</B>, {b.name}{' '}
        <B>{b.perStation === null ? '—' : `${b.perStation.toFixed(2)}기`}</B> (충전소 {fmtInt(a.stations)}곳 / {fmtInt(b.stations)}곳).
      </>,
      <>
        100kW 이상 비중(유효 출력 기준): {a.name} <B>{fmtP(out.a.high100Pct)}</B>, {b.name} <B>{fmtP(out.b.high100Pct)}</B>, 차이{' '}
        {fmtPp(hiPp)}.
      </>,
      <>
        삭제 표시 비율: {a.name} {fmtP(a.deletedPct, 2)}, {b.name} {fmtP(b.deletedPct, 2)} (자료상 표기이며 이용 가능 여부가 아닙니다).
      </>,
    ],
    interpretation: (
      <>
        {t && tx ? (tx.x < 1.1 ? `두 지역의 충전기 규모는 비슷한 수준입니다(${t}). ` : `두 지역의 충전기 규모는 ${t} 수준으로 차이가 납니다. `) : ''}
        {hiPp !== null && hiPp !== 0
          ? `100kW 이상 고출력 비중은 ${iGa(hiPp > 0 ? b.name : a.name)} ${Math.abs(hiPp).toFixed(1)}%p 높습니다. `
          : ''}
        충전기 수는 지역 규모를 반영하지 않은 절대값이며, 전기차 등록 대수와 기준 시점이 달라 서로 나눈 지표로 해석하지 않습니다.
      </>
    ),
    caution: `삭제 표시(delYn)는 자료상 표기이며 실제 이용 가능 여부를 뜻하지 않습니다. 100kW 이상 비중의 분모는 출력값이 양수인 충전기이며 결측·0 이하·숫자 아님은 제외합니다. 운영기관은 운영기관 ID 기준이며 같은 ID의 서로 다른 운영기관명 표기는 하나로 셉니다(같은 ID가 반드시 같은 법인이라는 뜻은 아님). ${DATE_NOTE}`,
    source: `${CH_SRC}, /api/charger-regions + /api/charger-output (지역별)`,
    variables: ['region_code', 'charger_count', 'station_count', 'deleted_charger_count', 'output_kw', 'value_status'],
  };
}

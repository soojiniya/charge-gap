const intFmt = new Intl.NumberFormat('ko-KR');

export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : intFmt.format(n));

export function fmtPct(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n > 0 && n < 0.1 && digits <= 1) return '<0.1%';
  return `${n.toFixed(digits)}%`;
}

/** 축 눈금용 축약 (1.2만, 52.7만) */
export function fmtCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${+(n / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${+(n / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}만`;
  if (abs >= 1_000) return `${+(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export const fmtKw = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${intFmt.format(n)}kW`);

/** "2026-10-15T04:16:31+09:00" → "04:16" */
export function fmtClock(iso?: string) {
  if (!iso) return '';
  const m = iso.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : iso;
}

export const DELETION_LABEL: Record<string, string> = {
  all: '삭제 포함 전체',
  not_deleted: '비삭제 표시',
  deleted: '삭제 표시',
};

export const VALUE_STATUS_LABEL: Record<string, string> = {
  positive_numeric: '유효 양수',
  missing: '결측',
  nonpositive: '0 이하',
  nonnumeric: '숫자 아님',
};

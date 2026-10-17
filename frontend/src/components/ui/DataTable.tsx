import { useEffect, useState, type ReactNode } from 'react';
import type { Pagination as PaginationMeta } from '../../api/types';
import { fmtInt } from '../../lib/format';
import { Icon } from './Icon';

export interface Column<T> {
  key: string;
  header: ReactNode;
  numeric?: boolean;
  wrap?: boolean;
  render: (row: T, index: number) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  isSelected?: (row: T) => boolean;
  maxHeight?: number;
}

export function DataTable<T>({ columns, rows, rowKey, caption, isSelected, maxHeight }: Props<T>) {
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined} tabIndex={0} aria-label={caption}>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? 'n' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row)} className={isSelected?.(row) ? 'is-selected' : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={[c.numeric && 'n', c.wrap && 'wrap'].filter(Boolean).join(' ') || undefined}>
                  {c.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** API meta.pagination을 그대로 사용하는 페이지 이동 컨트롤 */
export function Pager({
  pagination,
  onPage,
  unit,
  limit,
  limitOptions,
  onLimit,
  disabled,
}: {
  pagination: PaginationMeta;
  onPage: (page: number) => void;
  unit: string;
  limit?: number;
  limitOptions?: number[];
  onLimit?: (limit: number) => void;
  disabled?: boolean;
}) {
  const { page, total_pages, total_items, has_next } = pagination;
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);
  const start = total_items === 0 ? 0 : (page - 1) * pagination.limit + 1;
  const end = Math.min(page * pagination.limit, total_items);

  const commit = () => {
    const n = Number(draft);
    if (Number.isInteger(n) && n >= 1 && n <= Math.max(1, total_pages)) onPage(n);
    else setDraft(String(page));
  };

  return (
    <nav className="pagination" aria-label="페이지 이동">
      <span>
        전체 <b className="num">{fmtInt(total_items)}</b>
        {unit} 중 <span className="num">{fmtInt(start)}–{fmtInt(end)}</span>
      </span>
      <div className="pagination-controls">
        {limitOptions && onLimit && (
          <label className="row small" style={{ gap: 6, marginRight: 8 }}>
            <span>표시</span>
            <select className="select" style={{ height: 30 }} value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
              {limitOptions.map((n) => (
                <option key={n} value={n}>
                  {n}개
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="btn btn-sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="이전 페이지">
          <Icon name="chevronL" />
        </button>
        <input
          className="page-input"
          inputMode="numeric"
          aria-label="페이지 번호"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        <span className="num">/ {fmtInt(Math.max(1, total_pages))}</span>
        <button type="button" className="btn btn-sm" disabled={disabled || !has_next} onClick={() => onPage(page + 1)} aria-label="다음 페이지">
          <Icon name="chevronR" />
        </button>
      </div>
    </nav>
  );
}

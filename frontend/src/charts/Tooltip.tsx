import type { ReactNode } from 'react';

export interface TipRow {
  label: ReactNode;
  value: ReactNode;
  color?: string;
  hatched?: boolean;
}

/** 모든 차트가 공유하는 툴팁 본문. 값은 텍스트 색, 계열 색은 옆의 견본에만 씁니다. */
export function TipBox({ title, rows, note }: { title: ReactNode; rows: TipRow[]; note?: ReactNode }) {
  return (
    <div className="tt">
      <div className="tt-title">{title}</div>
      {rows.map((r, i) => (
        <div className="tt-row" key={i}>
          <span className="tt-key">
            {r.color && <span className={`swatch ${r.hatched ? 'hatched' : ''}`} style={{ background: r.color, color: r.color }} />}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
      {note && <div className="tt-note">{note}</div>}
    </div>
  );
}

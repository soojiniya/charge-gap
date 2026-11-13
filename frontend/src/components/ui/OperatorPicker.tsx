import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useAllOperators } from '../../api/hooks';
import { fmtInt } from '../../lib/format';

interface Option {
  id: string;
  names: string[];
  count: number;
}

/**
 * 운영기관 검색 콤보박스. 선택지는 /api/operators의 운영기관 ID 행(대표 이름 = 원본 기관명)에서 만들고,
 * 같은 ID의 운영기관명 표기(name_variants)로도 검색할 수 있게 합니다. API 필터(operator_id)도 운영기관 ID 단위입니다.
 */
export function OperatorPicker({ value, onChange }: { value?: string; onChange: (id?: string) => void }) {
  const q = useAllOperators();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const options: Option[] = useMemo(() => {
    const map = new Map<string, Option>();
    for (const row of q.data ?? []) {
      const o = map.get(row.operator_id) ?? { id: row.operator_id, names: [], count: 0 };
      for (const name of [row.operator_name, ...(row.name_variants ?? []).map((v) => v.name)]) {
        if (name && !o.names.includes(name)) o.names.push(name);
      }
      o.count += row.charger_count;
      map.set(row.operator_id, o);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [q.data]);

  const selected = options.find((o) => o.id === value);
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => o.id.toLowerCase().includes(t) || o.names.some((n) => n.toLowerCase().includes(t)));
  }, [options, query]);
  const visible = filtered.slice(0, 120);
  const activeIndex = Math.min(active, visible.length);

  useEffect(() => {
    if (open && q.data) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, listId, q.data]);

  const choose = (id?: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, visible.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(Math.min(a, visible.length) - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (activeIndex === 0) choose(undefined);
      else if (visible[activeIndex - 1]) choose(visible[activeIndex - 1].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const label = selected ? `${selected.names[0]} (${selected.id})` : value ? value : '';
  const placeholder = q.isLoading ? '운영기관 불러오는 중…' : q.error ? '운영기관 목록 오류' : `전체 기관 (${fmtInt(options.length)}개 ID)`;

  return (
    <div className="combo">
      <input
        ref={inputRef}
        className={`input select ${value ? 'is-set' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && q.data ? `${listId}-${activeIndex}` : undefined}
        aria-label="운영기관 검색 및 선택"
        placeholder={placeholder}
        disabled={!!q.error}
        value={open ? query : label}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      {open && q.data && (
        <ul className="combo-list" id={listId} role="listbox" aria-label="운영기관">
          <li
            id={`${listId}-0`}
            role="option"
            aria-selected={!value}
            className={`combo-option ${activeIndex === 0 ? 'active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(undefined);
            }}
          >
            전체 기관
          </li>
          {visible.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i + 1}`}
              role="option"
              aria-selected={o.id === value}
              className={`combo-option ${activeIndex === i + 1 ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o.id);
              }}
            >
              <span title={o.names.join(' / ')}>
                {o.names[0]}
                {o.names.length > 1 && <small> 외 표기 {o.names.length - 1}개</small>} <small>{o.id}</small>
              </span>
              <small>{fmtInt(o.count)}기</small>
            </li>
          ))}
          {!filtered.length && <li className="combo-empty">‘{query}’와 일치하는 기관이 없습니다.</li>}
          {filtered.length > 120 && <li className="combo-empty">상위 120개만 표시합니다. 검색어를 입력해 좁혀 보세요.</li>}
        </ul>
      )}
    </div>
  );
}

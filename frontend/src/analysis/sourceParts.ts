/**
 * 분석 근거의 '데이터 출처' 문자열을 표시용으로 나눕니다. 문구는 바꾸지 않고 위치만 나눕니다.
 *  "한국환경공단 충전기 정보 2026-10-15 조회, /api/charger-types (정의: …)"
 *   → name "한국환경공단 충전기 정보", date "2026-10-15 조회", api "/api/charger-types", apiNote "(정의: …)"
 *  "국토교통부 통계누리 · 작성기관 국토교통부 · 「자료명」 · 자료 기준 … · 파일 저장 … · 이용 조건 …, /api/ev-registration"
 *   → name "국토교통부 통계누리", items [{label:'작성기관', value:'국토교통부'}, {label:null, value:'「자료명」'}, …], api …
 * 형식이 다르면 나누지 않고 name에 원문 전체를 둡니다. joinSourceParts(parseSource(s)) === s.
 */
export interface SourceItem {
  /** 원문 앞머리 그대로의 항목 이름(예: '자료 기준'). 없으면 자료명 */
  label: string | null;
  value: string;
}
export interface SourceParts {
  name: string;
  date?: string;
  /** ' · '로 구분된 출처 항목 (제공기관 다음부터) */
  items?: SourceItem[];
  api?: string;
  apiNote?: string;
}

const ITEM_LABELS = ['작성기관', '제공', '자료 기준', '파일 저장', '조회', '이용 조건'] as const;
const SEP = ' · ';

function parseItem(text: string): SourceItem {
  const label = ITEM_LABELS.find((l) => text.startsWith(`${l} `));
  return label ? { label, value: text.slice(label.length + 1) } : { label: null, value: text };
}

export function parseSource(source: string): SourceParts {
  const apiAt = source.search(/, \/api\//);
  const head = apiAt >= 0 ? source.slice(0, apiAt) : source;
  const tail = apiAt >= 0 ? source.slice(apiAt + 2) : '';
  const parts: SourceParts = { name: head };
  const segments = head.split(SEP);
  const dated = head.match(/^(.*\S) (\d{4}-\d{2}-\d{2} 조회)$/);
  if (segments.length > 1 && segments.every((x) => x.trim() === x && x.length > 0)) {
    parts.name = segments[0];
    parts.items = segments.slice(1).map(parseItem);
  } else if (dated) {
    parts.name = dated[1];
    parts.date = dated[2];
  }
  if (tail) {
    const m = tail.match(/^(\/api\/\S+?)(?: (.+))?$/);
    if (m) {
      parts.api = m[1];
      if (m[2]) parts.apiNote = m[2];
    } else {
      parts.api = tail;
    }
  }
  return parts;
}

export function joinSourceParts(p: SourceParts): string {
  const items = p.items?.length ? p.items.map((i) => SEP + (i.label ? `${i.label} ${i.value}` : i.value)).join('') : '';
  return `${p.name}${items}${p.date ? ` ${p.date}` : ''}${p.api ? `, ${p.api}${p.apiNote ? ` ${p.apiNote}` : ''}` : ''}`;
}

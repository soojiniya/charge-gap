/**
 * 분석 근거의 '데이터 출처' 문자열을 표시용으로 나눕니다. 문구는 바꾸지 않고 위치만 나눕니다.
 *  "한국환경공단 충전기 정보 2026-10-15 조회, /api/charger-types (정의: …)"
 *   → name "한국환경공단 충전기 정보", date "2026-10-15 조회", api "/api/charger-types", apiNote "(정의: …)"
 * 형식이 다르면 나누지 않고 name에 원문 전체를 둡니다. joinSourceParts(parseSource(s)) === s.
 */
export interface SourceParts {
  name: string;
  date?: string;
  api?: string;
  apiNote?: string;
}

export function parseSource(source: string): SourceParts {
  const apiAt = source.search(/, \/api\//);
  const head = apiAt >= 0 ? source.slice(0, apiAt) : source;
  const tail = apiAt >= 0 ? source.slice(apiAt + 2) : '';
  const parts: SourceParts = { name: head };
  const dated = head.match(/^(.*\S) (\d{4}-\d{2}-\d{2} 조회)$/);
  if (dated) {
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
  return `${p.name}${p.date ? ` ${p.date}` : ''}${p.api ? `, ${p.api}${p.apiNote ? ` ${p.apiNote}` : ''}` : ''}`;
}

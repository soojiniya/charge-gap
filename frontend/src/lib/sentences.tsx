import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * '해석' 문단을 문장 단위로 나눕니다. 글자는 바꾸지 않고 나누는 위치만 정합니다.
 * 문장 끝 = 마침표 바로 뒤가 공백이거나 문단의 끝인 경우. 그래서 5.9%, 2.1배, 6.29처럼
 * 마침표 뒤에 숫자·글자가 붙는 경우는 나누지 않습니다.
 * 문장 사이의 공백은 앞 문장 끝에 그대로 남겨 화면 텍스트(textContent)가 원문과 같습니다.
 * <b> 같은 요소는 나누지 않는 한 덩어리로 다루고, Fragment만 펼쳐서 봅니다.
 */
type Atom = string | ReactElement;

function flatten(node: ReactNode, out: Atom[]) {
  Children.forEach(node, (child) => {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (typeof child === 'string' || typeof child === 'number') {
      const text = String(child);
      if (!text) return;
      const last = out[out.length - 1];
      if (typeof last === 'string') out[out.length - 1] = last + text;
      else out.push(text);
      return;
    }
    if (isValidElement(child) && child.type === Fragment) {
      flatten((child.props as { children?: ReactNode }).children, out);
      return;
    }
    if (isValidElement(child)) out.push(child);
  });
}

/** 마침표 + 공백(또는 끝) 위치에서 나눕니다. 공백은 앞 조각에 붙여 둡니다. */
function splitText(text: string, isLastAtom: boolean): { pieces: string[]; endsSentence: boolean[] } {
  const pieces: string[] = [];
  const endsSentence: boolean[] = [];
  const re = /\.(\s+|$)/g;
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const atEnd = m.index + m[0].length === text.length && m[1] === '';
    // 텍스트 조각 끝의 마침표는 문단 끝일 때만 확정 (뒤 요소가 붙어 이어지는 경우 대비)
    if (atEnd && !isLastAtom) break;
    const cut = m.index + m[0].length;
    pieces.push(text.slice(from, cut));
    endsSentence.push(true);
    from = cut;
  }
  if (from < text.length) {
    pieces.push(text.slice(from));
    endsSentence.push(false);
  }
  return { pieces, endsSentence };
}

export function splitSentences(node: ReactNode): ReactNode[][] {
  const atoms: Atom[] = [];
  flatten(node, atoms);
  const sentences: ReactNode[][] = [];
  let current: ReactNode[] = [];
  atoms.forEach((atom, i) => {
    if (typeof atom !== 'string') {
      current.push(atom);
      return;
    }
    // 텍스트 끝의 마침표 뒤에 다음 요소가 공백 없이 바로 붙으면(예: "다.<b>") 문장 끝이 아닙니다.
    const next = atoms[i + 1];
    const { pieces, endsSentence } = splitText(atom, next === undefined);
    pieces.forEach((piece, j) => {
      current.push(piece);
      if (endsSentence[j]) {
        sentences.push(current);
        current = [];
      }
    });
  });
  if (current.length) sentences.push(current);
  return sentences;
}

/** 문장마다 줄을 바꿔 표시합니다(내용은 그대로). 나눌 문장이 하나면 원래대로 둡니다. */
export function SentenceLines({ children }: { children: ReactNode }) {
  const sentences = splitSentences(children);
  if (sentences.length <= 1) return <>{children}</>;
  return (
    <>
      {sentences.map((parts, i) => (
        <span key={i} className="sentence-line">
          {parts.map((p, j) => (
            <Fragment key={j}>{p}</Fragment>
          ))}
        </span>
      ))}
    </>
  );
}

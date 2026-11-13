import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { C } from './theme';
import { TipBox } from './Tooltip';
import { fmtInt, fmtPct } from '../lib/format';
import { MOTION, useMotion } from '../lib/motion';

export interface TreeItem {
  key: string;
  name: string;
  size: number;
  share: number;
  other?: boolean;
  id?: string;
  /** 0 = 가장 큰 기관(밝음) … 1 = 가장 작은 기관(어두움). 순위 기반 명도 단계 */
  tone?: number;
  /** 1부터 시작하는 순위(기타 제외). 1~3위는 별도 위계로 표시 */
  rank?: number;
}

/**
 * 순위 위계(면적 = 충전기 수는 그대로, 색은 순위 보조 표현이며 칸마다 기관명·비율을 함께 씁니다):
 * 1위 = 포인트 색, 2·3위 = 밝은 회색 + 순위 배지, 4위 이하는 순위 구간별 회색 3단계, 기타 = 가장 어두운 회색.
 * 다른 기관을 선택하면 포인트 색은 선택 칸으로 옮겨 가고 1위는 밝은 회색이 됩니다.
 */
const TOP_FILL = ['#e5e5e5', '#d4d4d4', '#bdbdbd'];
/** 4위 이하 순위 구간: [마지막 순위, 회색 값]. 구간 사이 명도 차를 키워 칸 경계를 분명히 함 */
export const TREEMAP_BANDS: [number, number][] = [
  [6, 0x8c], // 4–6위: 검정 글씨 5.3:1
  [10, 0x72], // 7–10위: 흰 글씨 4.8:1
  [Infinity, 0x5a], // 11위 이하: 흰 글씨 6.6:1
];
export const TREEMAP_OTHER = '#363636';
const bandValue = (rank: number) => (TREEMAP_BANDS.find(([last]) => rank <= last) ?? TREEMAP_BANDS[TREEMAP_BANDS.length - 1])[1];
/** 이 회색 값 이상인 칸은 검정 글씨 */
const DARK_FROM = 0x80;
/** 한글 기준 대략적인 글자 폭(px) */
const charW = (size: number) => size * 0.98;
function fit(name: string | undefined, avail: number, size: number) {
  if (!name) return '';
  const n = Math.floor(avail / charW(size));
  if (name.length <= n) return name;
  if (n < 3) return '';
  return `${name.slice(0, n - 1)}…`;
}

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  share?: number;
  other?: boolean;
  id?: string;
  tone?: number;
  rank?: number;
  highlight?: string;
  index?: number;
  depth?: number;
  animate?: boolean;
}

function Cell({ x = 0, y = 0, width = 0, height = 0, name, share, other, id, tone = 0, rank, highlight, index = 0, animate }: CellProps) {
  if (width <= 0 || height <= 0) return null;
  const selected = !!highlight && id === highlight;
  const top = !other && rank !== undefined && rank <= 3;
  // 포인트 색은 한 칸에만: 선택한 기관, 선택이 없으면 1위
  const accent = selected || (!highlight && rank === 1 && !other);
  let fill: string;
  let darkInk: boolean;
  if (other) {
    fill = TREEMAP_OTHER;
    darkInk = false;
  } else if (accent) {
    fill = C.accent;
    darkInk = true;
  } else if (top) {
    fill = TOP_FILL[(rank ?? 1) - 1];
    darkInk = true;
  } else {
    const v = bandValue(rank ?? Math.round(4 + tone * 16));
    fill = `rgb(${v},${v},${v})`;
    darkInk = v >= DARK_FROM;
  }
  const big = top && width > 120 && height > 70;
  const nameSize = big ? 15 : 13;
  const ink = darkInk ? '#171717' : C.ink;
  const badge = top && width > 40 && height > 40;
  const lx = x + (badge ? 34 : 9);
  // 글씨는 칸 안쪽에만: 이름은 남는 폭에 맞춰 줄이고(3글자 미만이면 생략), 두 줄이 안 되는 칸은 비율만 한 줄로.
  const label = height >= 26 && width >= 40 ? fit(name, x + width - lx - 6, nameSize) : '';
  const twoLines = height >= (big ? 64 : 46);
  const showShare = share !== undefined && width >= 40 && height >= 22 && (twoLines || !label);
  const shareText = share !== undefined ? fmtPct(share, 1) : '';
  const clipId = `tm-clip-${index}-${Math.round(x)}-${Math.round(y)}`;
  return (
    <g className={`tm-cell ${animate ? 'enter' : ''}`} style={animate ? { animationDelay: `${Math.min(index, 20) * 18}ms` } : undefined}>
      {/* 1px 표면 간격으로 칸 구분 */}
      <rect x={x + 1} y={y + 1} width={Math.max(0, width - 2)} height={Math.max(0, height - 2)} rx={4} fill={fill} stroke={C.surface} strokeWidth={1} />
      {/* 선택 칸: 흰색 채움 + 안쪽 진한 테두리로 이웃 밝은 칸과 구분 */}
      {selected && (
        <rect x={x + 3} y={y + 3} width={Math.max(0, width - 6)} height={Math.max(0, height - 6)} rx={3} fill="none" stroke="#171717" strokeWidth={2} />
      )}
      {/* 1~3위 순위 배지 */}
      {badge && (
        <g aria-hidden="true">
          <circle cx={x + 19} cy={y + 20} r={10} fill="#171717" />
          <text className="tm-label" x={x + 19} y={y + 24.5} textAnchor="middle" fill={C.ink} fontSize={12} fontWeight={700}>
            {rank}
          </text>
        </g>
      )}
      <clipPath id={clipId}>
        <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {label && (
          <text className="tm-label" x={lx} y={y + (big ? 25 : 21)} fill={ink} fontSize={nameSize} fontWeight={big ? 700 : 600}>
            {label}
          </text>
        )}
        {showShare && (
          <text
            className="tm-label"
            x={big ? x + 12 : label ? lx : x + 8}
            y={label ? y + (big ? 54 : 40) : y + Math.min(21, height / 2 + 5)}
            fill={ink}
            fontSize={big ? 20 : 13}
            fontWeight={big ? 700 : 500}
            opacity={big ? 1 : 0.9}
            fontFamily="var(--font-num)"
          >
            {shareText}
          </text>
        )}
      </g>
    </g>
  );
}

/** 운영기관별 충전기 규모 트리맵. 상위 기관 + '기타' 1칸. 면적 = 충전기 수 */
export function OperatorTreemap({
  items,
  highlightId,
  onSelect,
  height = 360,
  ariaLabel,
}: {
  items: TreeItem[];
  highlightId?: string;
  onSelect?: (id: string) => void;
  height?: number;
  ariaLabel: string;
}) {
  const m = useMotion();
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <Treemap
          data={items}
          dataKey="size"
          nameKey="name"
          isAnimationActive={m.animate}
          animationDuration={MOTION.update}
          animationEasing="ease-out"
          aspectRatio={1.6}
          content={<Cell highlight={highlightId} animate={m.animate} />}
          onClick={(node) => {
            const n = node as unknown as { id?: string; other?: boolean };
            if (onSelect && n?.id && !n.other) onSelect(n.id);
          }}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as TreeItem;
              return (
                <TipBox
                  title={d.name}
                  rows={[
                    { label: '충전기', value: `${fmtInt(d.size)}기`, color: d.other ? C.other : C.s1 },
                    { label: '구성비', value: fmtPct(d.share, 2) },
                    ...(d.id ? [{ label: '기관 ID', value: d.id }] : []),
                  ]}
                  note={d.other ? '상위 목록 밖 기관의 합 (matched 총수 − 상위 합)' : onSelect ? '누르면 이 기관 ID로 필터합니다' : undefined}
                />
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}

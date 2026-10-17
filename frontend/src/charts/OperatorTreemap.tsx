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
}

/** 라벤더 단일 색상 순위 램프: 큰 기관일수록 밝게. 인접 칸의 경계를 분명히 하려는 보조 표현입니다. */
const RAMP = [
  [0xd8, 0xd3, 0xee],
  [0xb3, 0xab, 0xd9],
  [0x8c, 0x84, 0xbc],
  [0x68, 0x61, 0x96],
];
function rampColor(t: number) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const k = x - i;
  const c = RAMP[i].map((v, j) => Math.round(v + (RAMP[i + 1][j] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
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
  highlight?: string;
  index?: number;
  depth?: number;
  animate?: boolean;
}

function Cell({ x = 0, y = 0, width = 0, height = 0, name, share, other, id, tone = 0, highlight, index = 0, animate }: CellProps) {
  if (width <= 0 || height <= 0) return null;
  const selected = !!highlight && id === highlight;
  const fill = other ? C.other : selected ? C.s3 : rampColor(tone);
  const showName = width > 64 && height > 34;
  const showShare = width > 52 && height > 52;
  const ink = other || (!selected && tone > 0.62) ? C.ink : '#141821';
  return (
    <g className={`tm-cell ${animate ? 'enter' : ''}`} style={animate ? { animationDelay: `${Math.min(index, 20) * 18}ms` } : undefined}>
      {/* 1px 표면 간격으로 칸 구분 */}
      <rect x={x + 1} y={y + 1} width={Math.max(0, width - 2)} height={Math.max(0, height - 2)} rx={4} fill={fill} stroke={C.surface} strokeWidth={1} />
      {showName && (
        <text className="tm-label" x={x + 9} y={y + 21} fill={ink} fontSize={13} fontWeight={600}>
          {name && name.length * 13 > width - 16 ? `${name.slice(0, Math.max(1, Math.floor((width - 16) / 13) - 1))}…` : name}
        </text>
      )}
      {showShare && share !== undefined && (
        <text className="tm-label" x={x + 9} y={y + 40} fill={ink} fontSize={12} opacity={0.85}>
          {fmtPct(share, 1)}
        </text>
      )}
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

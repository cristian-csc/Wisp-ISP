export const RING_TONE = {
  success: { ring: 'text-success', chipBg: 'bg-lightsuccess', chipText: 'text-success' },
  warning: { ring: 'text-warning', chipBg: 'bg-lightwarning', chipText: 'text-warning' },
  error: { ring: 'text-error', chipBg: 'bg-lighterror', chipText: 'text-error' },
} as const;

export type RingTone = keyof typeof RING_TONE;

export function toneForPct(pct: number): RingTone {
  return pct >= 90 ? 'error' : pct >= 60 ? 'warning' : 'success';
}

const SIZES = {
  sm: { box: 'h-14 w-14', text: 'text-xs', r: 24, stroke: 6 },
  lg: { box: 'h-20 w-20', text: 'text-sm', r: 32, stroke: 8 },
} as const;

const RingProgress = ({ pct, tone, size = 'lg' }: { pct: number; tone: RingTone; size?: keyof typeof SIZES }) => {
  const { box, text, r, stroke } = SIZES[size];
  const dim = (r + stroke) * 2;
  const center = dim / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(pct, 100) / 100) * c;
  return (
    <div className={`relative ${box} shrink-0`}>
      <svg viewBox={`0 0 ${dim} ${dim}`} className={`${box} -rotate-90`}>
        <circle cx={center} cy={center} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={`stroke-current ${RING_TONE[tone].ring} transition-all`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${text} font-bold`}>{pct}%</span>
      </div>
    </div>
  );
};

export default RingProgress;

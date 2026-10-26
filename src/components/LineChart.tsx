interface Series {
  points: { x: number; y: number }[];
  className?: string;
  fill?: boolean;
}

interface Props {
  series: Series[];
  height?: number;
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  dots?: boolean;
  step?: boolean;
}

/** Минималистичный SVG-график без зависимостей. */
export function LineChart({ series, height = 220, formatX, formatY, dots, step }: Props) {
  const W = 640;
  const H = height;
  const pad = { l: 64, r: 12, t: 12, b: 26 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) return null;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  if (y0 === y1) { y0 *= 0.95; y1 *= 1.05; }
  const yPad = (y1 - y0) * 0.1;
  y0 = Math.max(0, y0 - yPad);
  y1 += yPad;
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const yTicks = [0, 1, 2, 3].map((i) => y0 + ((y1 - y0) * i) / 3);
  const xTicks = [0, 1, 2, 3].map((i) => x0 + ((x1 - x0) * i) / 3);

  const path = (pts: { x: number; y: number }[]) =>
    pts
      .map((p, i) => {
        if (i === 0) return `M${sx(p.x)},${sy(p.y)}`;
        return step ? `H${sx(p.x)}V${sy(p.y)}` : `L${sx(p.x)},${sy(p.y)}`;
      })
      .join("");

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
      {yTicks.map((t) => (
        <g key={t}>
          <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} />
          <text x={pad.l - 8} y={sy(t) + 4} textAnchor="end">{formatY(t)}</text>
        </g>
      ))}
      {xTicks.map((t, i) => (
        <text key={t} x={sx(t)} y={H - 6} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}>
          {formatX(t)}
        </text>
      ))}
      {series.map((s, i) => {
        const d = path(s.points);
        const last = s.points[s.points.length - 1];
        return (
          <g key={i}>
            {s.fill && <path className="area" d={`${d}V${sy(y0)}H${sx(s.points[0].x)}Z`} />}
            <path className={`line ${s.className ?? ""}`} d={d} />
            {dots && s.points.map((p) => <circle key={p.x} className="dot" cx={sx(p.x)} cy={sy(p.y)} r={4} />)}
            {!dots && last && <circle className="dot" cx={sx(last.x)} cy={sy(last.y)} r={4} />}
          </g>
        );
      })}
    </svg>
  );
}

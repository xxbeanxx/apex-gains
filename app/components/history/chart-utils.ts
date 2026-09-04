/**
 * Picks a "nice" gridline step (1/2/5 × a power of ten) for an axis whose
 * data max is `maxValue`, aiming for roughly `targetTicks` gridlines.
 */
export function niceAxisStep(maxValue: number, targetTicks = 4): number {
  if (maxValue <= 0) return 1;
  const roughStep = maxValue / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return niceResidual * magnitude;
}

/** Gridline tick values from 0 up to (and including) an axis max. */
export function axisTicks(axisMax: number, step: number): number[] {
  const ticks: number[] = [];
  for (let t = 0; t <= axisMax + step / 2; t += step) ticks.push(t);
  return ticks;
}

/** An SVG path for a bar: square baseline, rounded top corners. */
export function roundedTopBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const bottom = y + height;
  return `M${x},${bottom} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${bottom} Z`;
}

/** An SVG path for a horizontal bar: square left (baseline) end, rounded right (data) end. */
export function roundedRightBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, height / 2, width));
  const right = x + width;
  return `M${x},${y} L${right - r},${y} Q${right},${y} ${right},${y + r} L${right},${y + height - r} Q${right},${y + height} ${right - r},${y + height} L${x},${y + height} Z`;
}

export function formatMetricValue(value: number, unit: string): string {
  const rounded = unit === 'lb' ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString();
}

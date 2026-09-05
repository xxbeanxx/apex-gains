/**
 * Rounds a measurement for display: whole pounds, one decimal for
 * everything else (kilograms, minutes, reps).
 */
export function formatMetricValue(value: number, unit: string): string {
  const rounded = unit === 'lb' ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString();
}

/**
 * A y axis whose gridlines land on round numbers, for a series that does not
 * start at zero.
 *
 * Recharts nice-ifies an axis only when it owns both ends of the domain. A
 * trend line needs headroom above and below the data instead - pinning a
 * plateau to the top and bottom of the box reads as a cliff - and stating
 * that padded domain explicitly makes Recharts keep those exact endpoints as
 * ticks, which is how an axis ends up labelled 178 / 184 / 190 / 198. So the
 * padded bounds are snapped out to a 1/2/5 × 10^n step and the ticks handed
 * over ready-made.
 */
export function paddedAxis(dataMin: number, dataMax: number, targetTicks = 4): { domain: [number, number]; ticks: number[] } {
  const range = dataMax - dataMin;
  const pad = range > 0 ? range * 0.15 : Math.max(dataMax * 0.1, 1);
  const step = niceStep(range > 0 ? range : Math.max(dataMax, 1), targetTicks);

  // Clamped at zero: no measurement here goes negative, and an axis that
  // dips below it invites reading a bar as shorter than it is.
  const min = Math.max(0, Math.floor((dataMin - pad) / step) * step);
  const max = Math.ceil((dataMax + pad) / step) * step;

  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Math.round(value * 1000) / 1000);

  return { domain: [min, max], ticks };
}

/** A "nice" gridline step - 1, 2 or 5 times a power of ten. */
function niceStep(span: number, targetTicks: number): number {
  if (span <= 0) return 1;
  const rough = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return nice * magnitude;
}

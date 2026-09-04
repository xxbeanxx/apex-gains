import { useEffect, useRef, useState } from 'react';

/**
 * An element's rendered width in real CSS pixels, tracked live via
 * ResizeObserver. Charts use this as their SVG viewBox width so 1 viewBox
 * unit is always 1 screen pixel - text sizes stay at the px value declared
 * in code instead of being stretched or shrunk along with a fixed-width
 * viewBox (which is what made chart text unreadably small on narrow/mobile
 * screens).
 */
export function useChartWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

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

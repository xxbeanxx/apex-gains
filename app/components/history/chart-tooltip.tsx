import { cn } from '~/lib/utils';

/**
 * Positioned by percentage of the chart's own box (`x`/`y` each 0-100,
 * computed by the caller as a fraction of its rendered width/height) - so
 * it lines up with the SVG under it regardless of how that SVG scales.
 * Always anchors above `y` - every chart that uses this reserves enough
 * headroom above its topmost point/row for that to clear the card's edge.
 */
export function ChartTooltip({
  x,
  y,
  visible,
  children,
}: {
  x: number;
  y: number;
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-hidden={!visible}
      className={cn(
        'pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-opacity duration-(--dur-fast) ease-(--ease-quint)',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{ left: `${x}%`, top: `${y}%`, marginTop: -10 }}
    >
      {children}
    </div>
  );
}

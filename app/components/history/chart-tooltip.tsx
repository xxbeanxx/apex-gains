import { cn } from "~/lib/utils";

/**
 * Positioned by percentage (`x`/`y` of the chart's viewBox), which lines up
 * correctly with the SVG under it as long as the SVG uses
 * `preserveAspectRatio="none"` inside a container whose CSS aspect-ratio
 * matches the viewBox - see the two chart components for that pairing.
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
        "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-opacity duration-(--dur-fast) ease-(--ease-quint)",
        visible ? "opacity-100" : "opacity-0"
      )}
      style={{ left: `${x}%`, top: `${y}%`, marginTop: -10 }}
    >
      {children}
    </div>
  );
}

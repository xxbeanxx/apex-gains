import { cn } from '~/lib/utils';

/** First letter of the display name, for the fallback when there is no picture. */
function initial(name: string | null) {
  return name?.trim()?.charAt(0)?.toUpperCase() || '?';
}

/**
 * An athlete's picture, or their initial on a brand-tinted disc when Google
 * gave us no `avatarUrl`.
 *
 * Always `alt=""`: the name it stands for is rendered next to it everywhere
 * this appears, so announcing it again would only repeat the row.
 */
function Avatar({
  name,
  src,
  size = 28,
  className,
}: {
  name: string | null;
  src: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };

  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={style}
      className={cn('shrink-0 rounded-full object-cover ring-1 ring-border', className)}
    />
  ) : (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-muted text-xs font-semibold text-brand-strong ring-1 ring-brand/25',
        className,
      )}
    >
      {initial(name)}
    </span>
  );
}

export { Avatar };

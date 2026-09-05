import type { QrCode } from '~/lib/qr';

/**
 * A QR code, drawn from the matrix a loader encoded.
 *
 * Deliberately painted in fixed black-on-white rather than in theme tokens.
 * A scanner needs dark modules on a light ground with real contrast, and a
 * code inverted for dark mode is a code many phones will not read - so the
 * card gives it a white patch to sit on in both themes.
 *
 * Sized fluidly up to a cap rather than at a fixed width: this is the widest
 * thing in the share dialog, and a hard 12rem is wider than the content box
 * of a dialog on the narrowest phones. Shrinking costs nothing a scanner
 * cares about - even at the low end a module stays several pixels across.
 */
export function QrCodeImage({ code, label }: { code: QrCode; label: string }) {
  return (
    <svg
      viewBox={`0 0 ${code.size} ${code.size}`}
      role="img"
      aria-label={label}
      className="aspect-square h-auto w-full max-w-48 rounded-lg bg-white"
      shapeRendering="crispEdges"
    >
      <path d={code.path} fill="#000000" />
    </svg>
  );
}

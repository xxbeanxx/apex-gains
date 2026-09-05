import type { QrCode } from '~/lib/qr';

/**
 * A QR code, drawn from the matrix a loader encoded.
 *
 * Deliberately painted in fixed black-on-white rather than in theme tokens.
 * A scanner needs dark modules on a light ground with real contrast, and a
 * code inverted for dark mode is a code many phones will not read - so the
 * card gives it a white patch to sit on in both themes.
 */
export function QrCodeImage({ code, label }: { code: QrCode; label: string }) {
  return (
    <svg
      viewBox={`0 0 ${code.size} ${code.size}`}
      width="192"
      height="192"
      role="img"
      aria-label={label}
      className="size-48 rounded-lg bg-white"
      shapeRendering="crispEdges"
    >
      <path d={code.path} fill="#000000" />
    </svg>
  );
}

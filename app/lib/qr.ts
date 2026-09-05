/**
 * A QR code reduced to what a component needs to draw it: a side in modules
 * and one SVG path.
 *
 * Deliberately has no `.server` suffix. Encoding happens on the server (see
 * ./qr.server.ts, which is where the library lives), but the component that
 * paints the result runs in the browser too, and a server-only import there
 * fails the build with "Server-only module referenced by client".
 */
export type QrCode = {
  /** The code's width in modules, quiet zone included - the SVG's viewBox. */
  readonly size: number;
  /** One `<path d>` covering every dark module, drawn at one unit per module. */
  readonly path: string;
};

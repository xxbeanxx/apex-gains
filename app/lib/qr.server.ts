import qrcode from 'qrcode-generator';

import type { QrCode } from './qr';

/**
 * Four modules of clear space on every side. The spec requires it, and a
 * code rendered flush against a card edge is the classic reason a phone
 * refuses to scan one.
 */
const QUIET_ZONE = 4;

/**
 * Encodes `text` as a QR code.
 *
 * Server-side so `qrcode-generator` stays out of the client bundle - only
 * the `QrCode` a loader returns crosses to the browser.
 *
 * Type 0 lets the library pick the smallest version that fits, and error
 * correction 'M' (~15%) is the usual trade for a screen: 'L' saves a version
 * or two but gives up the redundancy that carries a code through glare and a
 * bad angle, which is exactly how a QR on a phone screen gets scanned.
 */
export function encodeQr(text: string): QrCode {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const modules = qr.getModuleCount();
  const commands: string[] = [];

  // One `M x y h n v1 h-n z` box per run of dark modules rather than per
  // module: a run is the same painted shape at a fraction of the path
  // length, and adjacent boxes in a path share no seam.
  for (let row = 0; row < modules; row++) {
    let runStart: number | null = null;

    for (let column = 0; column <= modules; column++) {
      const dark = column < modules && qr.isDark(row, column);

      if (dark && runStart === null) runStart = column;
      if (!dark && runStart !== null) {
        const length = column - runStart;
        commands.push(`M${runStart + QUIET_ZONE} ${row + QUIET_ZONE}h${length}v1h-${length}z`);
        runStart = null;
      }
    }
  }

  return { size: modules + QUIET_ZONE * 2, path: commands.join('') };
}

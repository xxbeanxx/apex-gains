import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';

import { encodeQr } from './qr.server';

const QUIET_ZONE = 4;

/**
 * Re-reads the modules back out of the path, so a test can compare what the
 * SVG actually paints against what the encoder produced - the run-length
 * packing in `encodeQr` is the part with somewhere to hide a bug, and a
 * QR that scans wrong looks exactly like one that scans right.
 */
function modulesFromPath(code: { size: number; path: string }): boolean[][] {
  const grid = Array.from({ length: code.size }, () => Array.from({ length: code.size }, () => false));

  for (const [, x, y, length] of code.path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let offset = 0; offset < Number(length); offset++) {
      grid[Number(y)]![Number(x) + offset] = true;
    }
  }
  return grid;
}

describe('encodeQr', () => {
  const url = 'https://apex.atomic-nucleus.com/plans/import/6Bx1_qZk3pQeR7tYuVwXyA';
  const code = encodeQr(url);

  it('paints exactly the modules the encoder marked dark', () => {
    const reference = qrcode(0, 'M');
    reference.addData(url);
    reference.make();

    const painted = modulesFromPath(code);
    const modules = reference.getModuleCount();

    for (let row = 0; row < modules; row++) {
      for (let column = 0; column < modules; column++) {
        expect(painted[row + QUIET_ZONE]![column + QUIET_ZONE]).toBe(reference.isDark(row, column));
      }
    }
  });

  it('surrounds the code with the quiet zone a scanner needs', () => {
    const painted = modulesFromPath(code);
    const edges = [0, 1, 2, 3, code.size - 4, code.size - 3, code.size - 2, code.size - 1];

    for (const index of edges) {
      expect(painted[index]!.some(Boolean), `row ${index} should be clear`).toBe(false);
      expect(
        painted.some((row) => row[index]),
        `column ${index} should be clear`,
      ).toBe(false);
    }
  });

  it('sizes itself to the content, quiet zone included', () => {
    const reference = qrcode(0, 'M');
    reference.addData(url);
    reference.make();

    expect(code.size).toBe(reference.getModuleCount() + QUIET_ZONE * 2);
    // A share URL of this length still fits a small version, which is what
    // keeps the code readable on a phone screen at a card's width.
    expect(reference.getModuleCount()).toBeLessThanOrEqual(45);
  });

  it('packs a run of adjacent dark modules into one command', () => {
    // Every finder pattern's top edge is seven dark modules in a row.
    expect(code.path).toContain('h7v1h-7z');
    // And never emits a zero-length run.
    expect(code.path).not.toContain('h0');
  });

  it('grows with the content rather than truncating it', () => {
    const long = encodeQr(`${url}?and=a-much-longer-query-string-than-any-share-link-would-ever-carry`);

    expect(long.size).toBeGreaterThan(code.size);
  });
});

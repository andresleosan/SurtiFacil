import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readPngDimensions(path: string): { width: number; height: number } {
  const png = readFileSync(new URL(path, import.meta.url));

  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

describe('PWA icon assets', () => {
  it('contains a valid 192x192 icon', () => {
    expect(readPngDimensions('../../public/icons/icon-192.png')).toEqual({
      width: 192,
      height: 192,
    });
  });

  it('contains a valid 512x512 icon', () => {
    expect(readPngDimensions('../../public/icons/icon-512.png')).toEqual({
      width: 512,
      height: 512,
    });
  });
});

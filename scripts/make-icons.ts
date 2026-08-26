import { deflateSync } from 'node:zlib';

/** CRC32，PNG 每个 chunk 都要带 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

type RGBA = [number, number, number, number];

/** 最小 PNG 编码器：RGBA、无滤波，够画图标了 */
function encodePng(size: number, pixel: (x: number, y: number) => RGBA): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 圆角矩形的覆盖率，带一点抗锯齿 */
function roundRect(x: number, y: number, l: number, t: number, w: number, h: number, r: number): number {
  const cx = Math.min(Math.max(x, l + r), l + w - r);
  const cy = Math.min(Math.max(y, t + r), t + h - r);
  const d = Math.hypot(x - cx, y - cy);
  if (x < l - 1 || x > l + w || y < t - 1 || y > t + h) return 0;
  return Math.max(0, Math.min(1, r - d + 0.5));
}

function blend(base: RGBA, over: RGBA, alpha: number): RGBA {
  const a = alpha * (over[3] / 255);
  return [
    Math.round(base[0] * (1 - a) + over[0] * a),
    Math.round(base[1] * (1 - a) + over[1] * a),
    Math.round(base[2] * (1 - a) + over[2] * a),
    Math.round(Math.max(base[3], a * 255)),
  ];
}

/** 品牌红底 + 两张错位的白色卡片，暗示「一篇笔记出多张图」 */
export function textpicIcon(size: number): Buffer {
  const s = size / 128;
  return encodePng(size, (x, y) => {
    let px: RGBA = [0, 0, 0, 0];
    const bg = roundRect(x, y, 4 * s, 4 * s, 120 * s, 120 * s, 28 * s);
    if (bg <= 0) return px;
    px = blend(px, [255, 46, 77, 255], bg);

    // 后面那张卡片，半透明
    const back = roundRect(x, y, 30 * s, 26 * s, 52 * s, 68 * s, 8 * s);
    if (back > 0) px = blend(px, [255, 255, 255, 110], back);

    // 前面那张卡片
    const front = roundRect(x, y, 48 * s, 38 * s, 52 * s, 68 * s, 8 * s);
    if (front > 0) {
      px = blend(px, [255, 255, 255, 255], front);
      // 卡片上的三条文字线
      for (const [ty, tw] of [
        [54, 34],
        [68, 34],
        [82, 22],
      ] as const) {
        const line = roundRect(x, y, 57 * s, ty * s, tw * s, 5 * s, 2.5 * s);
        if (line > 0) px = blend(px, [255, 46, 77, 200], line);
      }
    }
    return px;
  });
}

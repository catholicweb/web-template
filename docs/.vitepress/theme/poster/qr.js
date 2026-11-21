// Minimal, dependency-free QR code encoder (byte mode, versions 1-6, EC level M, falling back to L).
// Enough for URLs up to ~134 bytes; throws for longer text so callers can shorten the link.
// Algorithm follows ISO/IEC 18004 (same structure as Project Nayuki's MIT-licensed generator).

// [totalCodewords, dataCodewords, eccPerBlock, blocks] per version (index 0 = version 1)
const TABLE = {
  M: [[26, 16, 10, 1], [44, 28, 16, 1], [70, 44, 26, 1], [100, 64, 18, 2], [134, 86, 24, 2], [172, 108, 16, 4]],
  L: [[26, 19, 7, 1], [44, 34, 10, 1], [70, 55, 15, 1], [100, 80, 20, 1], [134, 108, 26, 1], [172, 136, 18, 2]],
};
const FORMAT_BITS = { L: 1, M: 0 };
const ALIGN_CENTER = [null, null, 18, 22, 26, 30, 34]; // by version

// ---- Reed-Solomon over GF(256), polynomial 0x11D -------------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly; // leading coefficient first
}

function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const rem = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// ---- Data codewords --------------------------------------------------------------
function utf8(text) {
  return Array.from(new TextEncoder().encode(text));
}

function pickVersion(bytes) {
  for (const level of ["M", "L"]) {
    for (let v = 1; v <= 6; v++) {
      const [, data] = TABLE[level][v - 1];
      if (bytes.length <= Math.floor((data * 8 - 12) / 8)) return { level, version: v };
    }
  }
  throw new Error("QR: text too long (max 134 bytes)");
}

function dataCodewords(bytes, dataLen) {
  const bits = [];
  const push = (value, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataLen * 8 - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; out.length < dataLen; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function interleave(data, [total, dataLen, eccLen, blocks]) {
  const per = dataLen / blocks;
  const dataBlocks = [];
  for (let b = 0; b < blocks; b++) dataBlocks.push(data.slice(b * per, (b + 1) * per));
  const eccBlocks = dataBlocks.map((d) => rsRemainder(d, eccLen));
  const out = [];
  for (let i = 0; i < per; i++) for (const d of dataBlocks) out.push(d[i]);
  for (let i = 0; i < eccLen; i++) for (const e of eccBlocks) out.push(e[i]);
  if (out.length !== total) throw new Error("QR: internal size mismatch");
  return out;
}

// ---- Matrix ------------------------------------------------------------------------
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
];

function formatBits(level, mask) {
  const data = (FORMAT_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function penalty(m) {
  const n = m.length;
  let score = 0;
  const line = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      let str = "";
      for (let b = 0; b < n; b++) {
        const v = get(a, b);
        str += v ? "1" : "0";
        if (b > 0 && v === get(a, b - 1)) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
      for (const pat of ["10111010000", "00001011101"]) {
        let i = str.indexOf(pat);
        while (i !== -1) {
          score += 40;
          i = str.indexOf(pat, i + 1);
        }
      }
    }
  };
  line((r, c) => m[r][c]);
  line((c, r) => m[r][c]);
  let dark = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) dark++;
      if (r < n - 1 && c < n - 1 && m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;
    }
  }
  const total = n * n;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Encode `text` and return a square boolean matrix (true = dark module). */
export function qrMatrix(text) {
  const bytes = utf8(String(text));
  const { level, version } = pickVersion(bytes);
  const spec = TABLE[level][version - 1];
  const codewords = interleave(dataCodewords(bytes, spec[1]), spec);
  const size = 17 + 4 * version;

  const mods = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    mods[y][x] = dark;
    fn[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  if (version >= 2) {
    const c = ALIGN_CENTER[version];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  const drawFormat = (mask) => {
    const bits = formatBits(level, mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0); // reserve the area

  // Zigzag placement of the codeword bits
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) {
          mods[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](y, x)) mods[y][x] = !mods[y][x];
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const s = penalty(mods);
    if (s < bestScore) {
      bestScore = s;
      best = mask;
    }
    applyMask(mask); // undo
  }
  applyMask(best);
  drawFormat(best);
  return mods;
}

/** SVG path data ("M..h..v..") for the dark modules; viewBox is `0 0 size size` (add your own quiet zone). */
export function qrPath(matrix) {
  let d = "";
  for (let y = 0; y < matrix.length; y++) {
    let x = 0;
    while (x < matrix.length) {
      if (!matrix[y][x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < matrix.length && matrix[y][end]) end++;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  }
  return d;
}

/** Convenience: { size, path } for a text. */
export function qrSvgData(text) {
  const matrix = qrMatrix(text);
  return { size: matrix.length, path: qrPath(matrix) };
}

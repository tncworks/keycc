/**
 * The sound of a keystroke as a ridgeline: L parallel lines receding in
 * depth, each a snapshot of the "spectrum" a moment earlier. The shape is
 * procedural — samples store (u along the line, line index, thickness
 * jitter) and the simulation reads the live amplitude history texture —
 * so typing makes ridges appear on the front line and travel back.
 */
import type { Rng } from "../random";
import { R1_A, ShapeBuffer, packAttr, setOrder } from "../sampling";

export const WAVE = {
  lines: 30,
  width: 5.0,
  depth: 2.2,
  height: 0.8,
  thickness: 0.0035,
  cols: 256,
  rows: 128,
  rowsPerLine: 3.6,
  rate: 28, // history rows per second
};

export function buildWaveform(N: number, rng: Rng): { buf: ShapeBuffer; rest: Float32Array } {
  const buf = new ShapeBuffer(N);
  const rest = new Float32Array(N * 3);
  const L = WAVE.lines;
  const offs = Array.from({ length: L }, () => rng());
  const counts = new Int32Array(L);
  for (let i = 0; i < N; i++) counts[Math.floor((i * L) / N)]++;
  let k = 0;
  for (let line = 0; line < L; line++) {
    const n = counts[line];
    const depth01 = line / (L - 1);
    const shade = 0.78 - 0.5 * Math.pow(depth01, 0.8);
    for (let j = 0; j < n; j++) {
      // golden-ratio sequence along the line: even and progressive
      const u0 = (offs[line] + j * R1_A) % 1;
      const u = Math.min(Math.max(u0 + (rng() - 0.5) * (0.6 / n), 0), 1);
      const jit = rng() * 2 - 1;
      buf.push(u, line, jit, 0, 0, 0, packAttr(shade, -1, false), 0, (j + offs[line]) / n);
      rest[k * 3] = (u - 0.5) * WAVE.width;
      rest[k * 3 + 1] = 0;
      rest[k * 3 + 2] = (0.5 - depth01) * WAVE.depth;
      k++;
    }
  }
  // build order: left to right, like reading a waveform
  setOrder(buf, (u) => u);
  return { buf, rest };
}

/**
 * Reads palette tokens from the CSS custom properties that Tailwind's
 * @theme emits, so the shaders and the DOM share one source of truth.
 * Any CSS colour syntax works (hex, rgb, oklch…): the browser rasterises a
 * pixel and we read back sRGB bytes, then convert to linear light.
 */
export type RGB = [number, number, number];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function readCssColor(varName: string, fallback: RGB): RGB {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.fillStyle = "#000";
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [srgbToLinear(d[0] / 255), srgbToLinear(d[1] / 255), srgbToLinear(d[2] / 255)];
}

export interface Palette {
  ground: RGB;
  particle: RGB;
  accent: RGB;
}

export function readPalette(): Palette {
  return {
    ground: readCssColor("--color-ground", [0.004, 0.0037, 0.0033]),
    particle: readCssColor("--color-particle", [0.86, 0.8, 0.7]),
    accent: readCssColor("--color-accent", [0.6, 0.25, 0.12]),
  };
}

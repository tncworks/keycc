/**
 * Headless Chromium with a real GPU. The default headless flags fall back to
 * SwiftShader (CPU); ANGLE on EGL uses the machine's GPU, so WebGL2 with
 * float render targets and MRT runs at native speed.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

export const GPU_ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=gl-egl", "--enable-unsafe-swiftshader"];

export async function launch() {
  const opts = { headless: true, args: GPU_ARGS };
  try {
    return await chromium.launch(opts);
  } catch (e) {
    // fall back to any cached Chromium build (the pinned one may not be downloaded)
    const cached = `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
    if (existsSync(cached)) return chromium.launch({ ...opts, executablePath: cached });
    throw e;
  }
}

/** Collects console errors/warnings and page errors. */
export function watchConsole(page, sink) {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") sink.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => sink.push(`[pageerror] ${e.message}`));
}

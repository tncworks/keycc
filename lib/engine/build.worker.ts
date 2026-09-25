/** Web Worker entry: builds the forms off the main thread (see build.ts). */
import { buildForms, type BuildRequest } from "./build";

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const res = buildForms(e.data, "worker");
  const transfer = [...res.pos, ...res.nrm].map((a) => a.buffer as ArrayBuffer);
  self.postMessage(res, { transfer });
};

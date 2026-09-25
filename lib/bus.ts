/**
 * A tiny event bus shared by the DOM layer and the particle engine, so the
 * keyboard listener, the key-sound synth, the "type anything" hint and the
 * GPU all react to the same physical keystrokes. Listeners are passive and
 * never call preventDefault: Space, PgDn, arrows, Home/End keep scrolling.
 */
import { KEYS, keyIndexForCode } from "./engine/layout75";

export interface KeyEvt {
  code: string;
  index: number; // -1 when the key is not on the Mote 75
  label: string;
  down: boolean;
  repeat: boolean;
  time: number;
}

type Fn<T> = (v: T) => void;

function channel<T>() {
  const set = new Set<Fn<T>>();
  return {
    on(fn: Fn<T>) {
      set.add(fn);
      return () => void set.delete(fn);
    },
    emit(v: T) {
      for (const fn of set) fn(v);
    },
  };
}

export const keyChannel = channel<KeyEvt>();
/** all keys released (window blur) */
export const releaseChannel = channel<void>();

let installs = 0;
let teardown: (() => void) | null = null;

function labelFor(e: KeyboardEvent, index: number): string {
  if (index >= 0) return KEYS[index].label;
  return e.key.length === 1 ? e.key.toUpperCase() : e.key.toLowerCase();
}

/** Ref-counted, idempotent install of the global key listeners. */
export function installKeyboard(): () => void {
  installs++;
  if (installs === 1 && typeof window !== "undefined") {
    const down = (e: KeyboardEvent) => {
      const index = keyIndexForCode(e.code);
      keyChannel.emit({ code: e.code, index, label: labelFor(e, index), down: true, repeat: e.repeat, time: performance.now() });
    };
    const up = (e: KeyboardEvent) => {
      const index = keyIndexForCode(e.code);
      keyChannel.emit({ code: e.code, index, label: labelFor(e, index), down: false, repeat: false, time: performance.now() });
    };
    const blur = () => releaseChannel.emit();
    window.addEventListener("keydown", down, { passive: true });
    window.addEventListener("keyup", up, { passive: true });
    window.addEventListener("blur", blur);
    teardown = () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    installs--;
    if (installs === 0) {
      teardown?.();
      teardown = null;
    }
  };
}

/** Minimal external store (useSyncExternalStore-compatible). */
export function store<T>(initial: T) {
  let value = initial;
  const ch = channel<T>();
  return {
    get: () => value,
    set(v: T) {
      if (Object.is(v, value)) return;
      value = v;
      ch.emit(v);
    },
    subscribe(fn: () => void) {
      return ch.on(() => fn());
    },
  };
}

export const soundStore = store(false);
/** 0..N: which story section the engine is showing (rounded morph coordinate) */
export const stationStore = store(0);

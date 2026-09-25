/**
 * Mote 75 layout table. 1u = 19.05 mm pitch. x/y in units from the top-left
 * of the key field, w in units. Row selects the Cherry-style sculpt profile.
 * KeyboardEvent.code is used (physical position, keymap-independent).
 */

export interface KeyDef {
  code: string;
  label: string;
  x: number;
  y: number;
  w: number;
  row: number;
  accent?: boolean;
}

export const PITCH_MM = 19.05;
export const FIELD_U = { w: 16, h: 6.25 };

type Row = [code: string, label: string, x: number, w?: number][];

const R0: Row = [
  ["Escape", "esc", 0],
  ["F1", "F1", 1.25], ["F2", "F2", 2.25], ["F3", "F3", 3.25], ["F4", "F4", 4.25],
  ["F5", "F5", 5.5], ["F6", "F6", 6.5], ["F7", "F7", 7.5], ["F8", "F8", 8.5],
  ["F9", "F9", 9.75], ["F10", "F10", 10.75], ["F11", "F11", 11.75], ["F12", "F12", 12.75],
  ["Delete", "del", 14],
];
const R1: Row = [
  ["Backquote", "`", 0], ["Digit1", "1", 1], ["Digit2", "2", 2], ["Digit3", "3", 3], ["Digit4", "4", 4],
  ["Digit5", "5", 5], ["Digit6", "6", 6], ["Digit7", "7", 7], ["Digit8", "8", 8], ["Digit9", "9", 9],
  ["Digit0", "0", 10], ["Minus", "-", 11], ["Equal", "=", 12], ["Backspace", "⌫", 13, 2], ["Home", "home", 15],
];
const R2: Row = [
  ["Tab", "tab", 0, 1.5], ["KeyQ", "Q", 1.5], ["KeyW", "W", 2.5], ["KeyE", "E", 3.5], ["KeyR", "R", 4.5],
  ["KeyT", "T", 5.5], ["KeyY", "Y", 6.5], ["KeyU", "U", 7.5], ["KeyI", "I", 8.5], ["KeyO", "O", 9.5],
  ["KeyP", "P", 10.5], ["BracketLeft", "[", 11.5], ["BracketRight", "]", 12.5], ["Backslash", "\\", 13.5, 1.5],
  ["PageUp", "pg up", 15],
];
const R3: Row = [
  ["CapsLock", "caps", 0, 1.75], ["KeyA", "A", 1.75], ["KeyS", "S", 2.75], ["KeyD", "D", 3.75], ["KeyF", "F", 4.75],
  ["KeyG", "G", 5.75], ["KeyH", "H", 6.75], ["KeyJ", "J", 7.75], ["KeyK", "K", 8.75], ["KeyL", "L", 9.75],
  ["Semicolon", ";", 10.75], ["Quote", "'", 11.75], ["Enter", "return", 12.75, 2.25], ["PageDown", "pg dn", 15],
];
const R4: Row = [
  ["ShiftLeft", "shift", 0, 2.25], ["KeyZ", "Z", 2.25], ["KeyX", "X", 3.25], ["KeyC", "C", 4.25], ["KeyV", "V", 5.25],
  ["KeyB", "B", 6.25], ["KeyN", "N", 7.25], ["KeyM", "M", 8.25], ["Comma", ",", 9.25], ["Period", ".", 10.25],
  ["Slash", "/", 11.25], ["ShiftRight", "shift", 12.25, 1.75], ["ArrowUp", "↑", 14], ["End", "end", 15],
];
const R5: Row = [
  ["ControlLeft", "ctrl", 0, 1.25], ["MetaLeft", "⌘", 1.25, 1.25], ["AltLeft", "alt", 2.5, 1.25],
  ["Space", "space", 3.75, 6.25], ["AltRight", "alt", 10], ["Fn", "fn", 11], ["ControlRight", "ctrl", 12],
  ["ArrowLeft", "←", 13], ["ArrowDown", "↓", 14], ["ArrowRight", "→", 15],
];

const ROWS: { keys: Row; y: number }[] = [
  { keys: R0, y: 0 },
  { keys: R1, y: 1.25 },
  { keys: R2, y: 2.25 },
  { keys: R3, y: 3.25 },
  { keys: R4, y: 4.25 },
  { keys: R5, y: 5.25 },
];

export const KEYS: KeyDef[] = ROWS.flatMap(({ keys, y }, row) =>
  keys.map(([code, label, x, w = 1]) => ({ code, label, x, y, w, row, accent: code === "Escape" })),
);

/** The rotary knob sits in the top-right corner, where PrtSc would be. */
export const KNOB = { x: 15, y: 0, w: 1 };

const INDEX = new Map<string, number>(KEYS.map((k, i) => [k.code, i]));
const ALIASES: Record<string, string> = {
  OSLeft: "MetaLeft",
  OSRight: "AltRight",
  MetaRight: "AltRight",
  ContextMenu: "Fn",
  PrintScreen: "Delete",
  Insert: "Delete",
  ScrollLock: "Delete",
  Pause: "Delete",
  NumpadEnter: "Enter",
  NumpadAdd: "Equal",
  NumpadSubtract: "Minus",
  NumpadDecimal: "Period",
  NumpadDivide: "Slash",
  NumpadMultiply: "Digit8",
  IntlBackslash: "ShiftLeft",
  IntlRo: "Slash",
  IntlYen: "Backspace",
};

/** Key index for a KeyboardEvent.code, or -1. */
export function keyIndexForCode(code: string): number {
  const direct = INDEX.get(code);
  if (direct !== undefined) return direct;
  const alias = ALIASES[code];
  if (alias) return INDEX.get(alias) ?? -1;
  const m = /^Numpad(\d)$/.exec(code);
  if (m) return INDEX.get(`Digit${m[1]}`) ?? -1;
  return -1;
}

/** Normalised layout position (0..1 across, 0..1 down) of a key's centre. */
export function keyUV(i: number): [number, number] {
  const k = KEYS[i];
  return [(k.x + k.w / 2) / FIELD_U.w, (k.y + 0.5) / FIELD_U.h];
}

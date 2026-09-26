"use client";

import { useSyncExternalStore } from "react";
import { configStore, type Config } from "@/lib/bus";

const server: Config = { finish: "chalk", switch: "linear", layout: "ansi" };

export function useConfig(): Config {
  return useSyncExternalStore(configStore.subscribe, configStore.get, () => server);
}

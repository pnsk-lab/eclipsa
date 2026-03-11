import type { DevClientInfo } from "./types.ts";
import { hydrate } from "../client/mod.ts";

const getDevInfo = (): DevClientInfo => {
  const elem = document.getElementById("eclipsa-devinfo");

  if (!elem) {
    throw new Error("devinfo element is falsy.");
  }

  return JSON.parse(elem.innerHTML);
};

export const initDevClient = async () => {
  const Component = (await import(/* @vite-ignore */ getDevInfo().entry.url)).default;
  hydrate(Component, document.body);
};

export * from "./hot.ts";

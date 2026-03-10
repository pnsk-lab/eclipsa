import { FRAGMENT } from "./shared.ts";
import type { JSX } from "./types.ts";

export const jsxDEV = (
  type: JSX.Type,
  props: Record<string, unknown>,
  key: string | number | symbol,
  isStatic: boolean,
  metadata: JSX.Metadata,
): JSX.Element => ({
  type,
  props,
  key,
  isStatic,
  metadata,
});
export const Fragment = FRAGMENT;

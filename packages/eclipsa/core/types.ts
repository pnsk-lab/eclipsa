import type { JSX } from "../jsx/jsx-runtime.ts";

export interface SSRRootProps {
  children: JSX.Element[] | JSX.Element;
  head: JSX.Element;
}

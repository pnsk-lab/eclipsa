import clsx from "clsx";
import { Link, useComputed$, useLocation } from "eclipsa";
import type { JSX } from "eclipsa/jsx-runtime";

const Dir = (props: { children: JSX.Element | JSX.Element[] }) => {
  return (
    <div class="">
      <button class="flex items-center gap-2 h-6 transition-transform hover:scale-105 active:scale-95 mb-1">
        <div class="bg-linear-to-br from-emerald-700 to-teal-400 p-1 rounded-lg">
          <div class="i-tabler-north-star text-white" />
        </div>
        <div class="text-zinc-700 text-base font-medium">Getting Started</div>
        <div class="grow" />
        <div class="i-tabler-chevron-down" />
      </button>
      {props.children}
    </div>
  );
};
export const PageLink = (props: { label: string, href: string }) => {
  const loc = useLocation()
  const isActive = useComputed$(() => loc.pathname === props.href)
  return (
    <Link
      href={props.href}
      class={clsx(
        "flex h-8 items-center rounded-lg transition-colors",
        isActive.value ? "bg-purple-200 text-purple-950" : "hover:bg-purple-200/70",
      )}
    >
      <div class={clsx("h-full w-px bg-gray-300 transition-all", isActive.value ? "scale-y-60 bg-purple-700" : "")}></div>
      <div class="pl-4 py-1 text-sm">{props.label}</div>
    </Link>
  );
};

export default function DocsLayout(props: { children: JSX.Childable }) {
  return (
    <div class="flex">
      <div class="px-8 py-6 w-68 text-zinc-500">
        <Dir>
          <PageLink label="Overview" href="/docs/getting-started/overview" />
          <PageLink label="Quick Start" href="/docs/getting-started/quick-start" />
          <PageLink label="Usage" href="/docs/getting-started/usage" />
        </Dir>
      </div>
      <div class="px-8 grow flex-1">
        <div class="max-w-2xl mx-auto">{props.children}</div>
      </div>
    </div>
  );
}

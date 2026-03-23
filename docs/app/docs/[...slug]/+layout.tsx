import { Link } from "eclipsa";
import type { JSX } from "eclipsa/jsx-runtime";

const Dir = (props: { children: JSX.Childable }) => {
  return (
    <div class="">
      <button class="flex items-center gap-2 h-6 transition-transform hover:scale-105 active:scale-95">
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
export const PageLink = () => {
  return (
    <Link href="/docs/getting-started/overview" class="flex h-8">
      <div class="h-full w-px bg-gray-300"></div>
      <div class="pl-4 py-1 text-sm">Overview</div>
    </Link>
  );
};

export default function DocsLayout(props: { children: JSX.Childable }) {
  return (
    <div class="flex">
      <div class="px-8 py-6 w-68 text-zinc-500"></div>
      <div class="px-8 grow flex-1">
        <div class="max-w-2xl mx-auto">{props.children}</div>
        <Dir>a</Dir>
      </div>
    </div>
  );
}

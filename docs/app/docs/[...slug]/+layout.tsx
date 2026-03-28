import clsx from "clsx";
import { motion } from "@eclipsa/motion";
import { Link, useLocation, useSignal } from "eclipsa";
import type { JSX } from "eclipsa/jsx-runtime";

const Dir = (props: { activeHref: string; links: { href: string; label: string }[]; title: string }) => {
  const open = useSignal(true);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open.value}
        class="mb-1 flex h-6 w-full cursor-pointer items-center gap-2 transition-transform hover:scale-105 active:scale-95"
        onClick={() => {
          open.value = !open.value;
        }}
      >
        <div class="bg-linear-to-br from-emerald-700 to-teal-400 rounded-lg p-1">
          <div class="i-tabler-north-star text-white" />
        </div>
        <div class="text-zinc-700 text-base font-medium">{props.title}</div>
        <div class="grow" />
        <motion.div
          class="i-tabler-chevron-down"
          initial={false}
          animate={{
            rotate: open.value ? 0 : -90,
          }}
          transition={{
            duration: 0.2,
          }}
        />
      </button>
      <motion.div
        class="overflow-hidden"
        initial={false}
        animate={{
          maxHeight: open.value ? props.links.length * 32 : 0,
          opacity: open.value ? 1 : 0,
          y: open.value ? 0 : -4,
        }}
        transition={{
          duration: 0.2,
        }}
      >
        {props.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            class={clsx(
              "flex h-8 items-center rounded-lg transition-colors",
              props.activeHref === link.href
                ? "bg-purple-200 text-purple-950"
                : "hover:bg-purple-200/70",
            )}
          >
            <div
              class={clsx(
                "h-full w-px bg-gray-300 transition-all",
                props.activeHref === link.href ? "scale-y-60 bg-purple-700" : "",
              )}
            ></div>
            <div class="pl-4 py-1 text-sm">{link.label}</div>
          </Link>
        ))}
      </motion.div>
    </div>
  );
};

export default function DocsLayout(props: { children: JSX.Childable }) {
  const loc = useLocation();
  return (
    <div class="flex items-start pt-18">
      <div class="sticky top-18 w-68 shrink-0 self-start px-8 py-6 text-zinc-500 flex flex-col gap-4">
        <Dir
          title="Getting Started"
          activeHref={loc.pathname}
          links={[
            { label: "Overview", href: "/docs/getting-started/overview" },
            { label: "Quick Start", href: "/docs/getting-started/quick-start" },
          ]}
        />
        <Dir
          title="Materials"
          activeHref={loc.pathname}
          links={[
            { label: "Signal", href: "/docs/materials/signal" },
            { label: "Atom", href: "/docs/materials/atom" },
          ]}
        />
        <Dir
          title="Integrations"
          activeHref={loc.pathname}
          links={[
            { label: "Motion", href: "/docs/integrations/motion" },
            { label: "Ox Content", href: "/docs/integrations/content" },
          ]}
        />
      </div>
      <div class="px-8 grow flex-1">
        <div class="h-18" />
        <div class="max-w-2xl mx-auto">{props.children}</div>
      </div>
    </div>
  );
}

import { Link, useLocation, useNavigate } from "eclipsa";
import { Logo } from "../components/logo";
import "./style.css";
import clsx from "clsx";

export default (props: { children?: unknown }) => {
  const loc = useLocation()
  return (
    <div>
      <nav
        class={clsx(
          "fixed top-0 z-50 flex w-full items-center justify-between px-6 py-6",
          loc.pathname === '/' ? "bg-[linear-gradient(to_bottom,rgba(5,5,5,1),rgba(5,5,5,0))] text-white" : "",
        )}
      >
        <Link
          class="flex items-center gap-2 text-xl font-urbanist"
          data-interactive=""
          href="/"
        >
          <Logo class="w-5 h-5" />
          <span>eclipsa</span>
        </Link>

        <div class="hidden items-center gap-8 text-sm font-bold uppercase tracking-[0.3em] text-zinc-400 md:flex">
          <Link
            class="transition-colors hover:text-white"
            data-interactive=""
            href={`${import.meta.env.BASE_URL}docs/getting-started/overview`}
          >
            Docs
          </Link>
          <Link
            class="transition-colors hover:text-white"
            data-interactive=""
            href={`${import.meta.env.BASE_URL}playground`}
          >
            Playground
          </Link>
          <Link
            class="transition-colors hover:text-white"
            data-interactive=""
            href={`${import.meta.env.BASE_URL}reference`}
          >
            Reference
          </Link>
        </div>

        <a
          aria-label="GitHub"
          class="transition-colors hover:text-[#9d00ff]"
          data-interactive=""
          href="https://github.com/pnsk-lab/eclipsa"
        >
          <svg
            aria-hidden="true"
            class="h-6 w-6"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20.1 4.77 5.07 5.07 0 0 0 20 1s-1.18-.35-4 1.48a13.38 13.38 0 0 0-7 0C6.18.65 5 1 5 1a5.07 5.07 0 0 0-.1 3.77A5.44 5.44 0 0 0 3.5 8.5c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
          </svg>
        </a>
      </nav>
      <div>{props.children}</div>
    </div>
  );
};

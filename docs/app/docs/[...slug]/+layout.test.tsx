import { describe, expect, it } from "vitest";
import type { AppContext } from "../../../../packages/eclipsa/core/hooks.ts";
import { primeLocationState } from "../../../../packages/eclipsa/core/runtime.ts";
import { renderSSRAsync } from "../../../../packages/eclipsa/core/ssr.ts";
import DocsLayout from "./+layout.tsx";

describe("docs layout", () => {
  it("hides the On this page mobile UI below lg while keeping the desktop sidebar", async () => {
    const result = await renderSSRAsync(
      () => (
        <DocsLayout>
          <article>Routing content</article>
        </DocsLayout>
      ),
      {
        context: {
          req: {
            param(name: string) {
              return name === "slug" ? "materials/routing" : "";
            },
          },
        } as unknown as AppContext,
        prepare(container) {
          primeLocationState(container, "https://example.com/docs/materials/routing");
        },
      },
    );

    expect(result.html).toContain('data-testid="docs-mobile-nav-toggle"');
    expect(result.html).toContain(">Menu</span>");
    expect(result.html).toContain(">Routing</div>");
    expect(result.html).toContain(">Action</div>");
    expect(result.html).toContain('id="docs-mobile-drawer-shell"');
    expect(result.html).not.toContain('data-testid="docs-mobile-toc-toggle"');
    expect(result.html).not.toContain('id="docs-mobile-toc-shell"');
    expect(result.html).toContain("transition-opacity lg:hidden pointer-events-none");
    expect(result.html).toContain("hidden lg:sticky lg:top-22 lg:flex lg:w-64");
    expect(result.html).toContain(">On this page</span>");
    expect(result.html).toContain(">Route tree</a>");
  });
});

import { describe, expect, it } from "vitest";
import { applyHotUpdate, createHotRegistry, defineHotComponent } from "./hot.ts";

const makeComponent = (value: string) => ((_: unknown) => value) as any;

describe("core/dev-client hot", () => {
  it("updates wrapped components even when function source is unchanged", () => {
    const registry = createHotRegistry();
    const wrapped = defineHotComponent(makeComponent("before"), {
      registry,
      name: "default",
    });

    const rendered = wrapped({});

    expect((rendered as () => string)()).toBe("before");

    const newRegistry = createHotRegistry();
    defineHotComponent(makeComponent("after"), {
      registry: newRegistry,
      name: "default",
    });

    expect(applyHotUpdate(registry, newRegistry)).toBe("updated");
    expect((rendered as () => string)()).toBe("after");
  });

  it("requests reload when the component graph changes", () => {
    const registry = createHotRegistry();
    defineHotComponent(makeComponent("before"), {
      registry,
      name: "default",
    });

    const newRegistry = createHotRegistry();
    defineHotComponent(makeComponent("after"), {
      registry: newRegistry,
      name: "default",
    });
    defineHotComponent(makeComponent("extra"), {
      registry: newRegistry,
      name: "extra",
    });

    expect(applyHotUpdate(registry, newRegistry)).toBe("reload");
  });
});

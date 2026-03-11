import { describe, expect, it } from "vitest";
import {
  applyResumeHmrSymbolReplacements,
  applyResumeHmrUpdate,
  collectResumeHmrBoundaryIds,
  type RuntimeContainer,
} from "./runtime.ts";

const createContainer = (overrides?: Partial<RuntimeContainer>) =>
  ({
    components: new Map(),
    dirty: new Set(),
    doc: undefined,
    imports: new Map(),
    nextComponentId: 0,
    nextElementId: 0,
    nextScopeId: 0,
    nextSignalId: 0,
    rootChildCursor: 0,
    rootElement: undefined,
    scopes: new Map(),
    signals: new Map(),
    symbols: new Map(),
    watches: new Map(),
    ...overrides,
  }) as RuntimeContainer;

describe("resume HMR runtime helpers", () => {
  it("updates both old and next symbol ids when applying URL replacements", () => {
    const container = createContainer({
      imports: new Map([
        ["old-symbol", Promise.resolve({ default: () => null })],
        ["next-symbol", Promise.resolve({ default: () => null })],
      ]),
      symbols: new Map([
        ["old-symbol", "/app/+page.tsx?eclipsa-symbol=old-symbol"],
      ]),
    });

    applyResumeHmrSymbolReplacements(container, {
      "old-symbol": "/app/+page.tsx?eclipsa-symbol=next-symbol",
    });

    expect(container.symbols.get("old-symbol")).toBe("/app/+page.tsx?eclipsa-symbol=next-symbol");
    expect(container.symbols.get("next-symbol")).toBe("/app/+page.tsx?eclipsa-symbol=next-symbol");
    expect(container.imports.has("old-symbol")).toBe(false);
    expect(container.imports.has("next-symbol")).toBe(false);
  });

  it("keeps historical symbol aliases pointed at the latest URL across repeated updates", () => {
    const container = createContainer({
      components: new Map([
        [
          "c0",
          {
            active: true,
            didMount: false,
            end: {} as Comment,
            id: "c0",
            parentId: "$root",
            props: {},
            scopeId: "scope-root",
            signalIds: [],
            start: {} as Comment,
            symbol: "old-symbol",
            watchCount: 0,
          },
        ],
      ]),
      imports: new Map([
        ["old-symbol", Promise.resolve({ default: () => null })],
        ["mid-symbol", Promise.resolve({ default: () => null })],
      ]),
      symbols: new Map([
        ["old-symbol", "/app/+page.tsx?eclipsa-symbol=old-symbol"],
      ]),
      watches: new Map([
        [
          "w0",
          {
            componentId: "c0",
            effect: {
              fn: () => {},
              signals: new Set(),
            },
            id: "w0",
            mode: "dynamic",
            pending: null,
            run: null,
            scopeId: "scope-root",
            symbol: "old-symbol",
            track: null,
          },
        ],
      ]),
    });

    expect(collectResumeHmrBoundaryIds(container, ["old-symbol"])).toEqual(["c0"]);

    applyResumeHmrSymbolReplacements(container, {
      "old-symbol": "/app/+page.tsx?eclipsa-symbol=mid-symbol",
    });
    expect(container.components.get("c0")?.symbol).toBe("mid-symbol");
    expect(container.watches.get("w0")?.symbol).toBe("mid-symbol");
    expect(collectResumeHmrBoundaryIds(container, ["mid-symbol"])).toEqual(["c0"]);

    applyResumeHmrSymbolReplacements(container, {
      "mid-symbol": "/app/+page.tsx?eclipsa-symbol=next-symbol",
    });

    expect(container.symbols.get("old-symbol")).toBe("/app/+page.tsx?eclipsa-symbol=next-symbol");
    expect(container.symbols.get("mid-symbol")).toBe("/app/+page.tsx?eclipsa-symbol=next-symbol");
    expect(container.symbols.get("next-symbol")).toBe("/app/+page.tsx?eclipsa-symbol=next-symbol");
    expect(container.components.get("c0")?.symbol).toBe("next-symbol");
    expect(container.watches.get("w0")?.symbol).toBe("next-symbol");
    expect(collectResumeHmrBoundaryIds(container, ["next-symbol"])).toEqual(["c0"]);
    expect(container.imports.has("old-symbol")).toBe(false);
    expect(container.imports.has("mid-symbol")).toBe(false);
    expect(container.imports.has("next-symbol")).toBe(false);
  });

  it("rerenders the nearest mounted boundary for nested active components", () => {
    const container = createContainer({
      components: new Map([
        [
          "c0",
          {
            active: true,
            didMount: false,
            end: {} as Comment,
            id: "c0",
            parentId: "$root",
            props: {},
            scopeId: "scope-root",
            signalIds: [],
            start: {} as Comment,
            symbol: "page-symbol",
            watchCount: 0,
          },
        ],
        [
          "c0.0",
          {
            active: true,
            didMount: false,
            id: "c0.0",
            parentId: "c0",
            props: {},
            scopeId: "scope-header",
            signalIds: [],
            symbol: "header-symbol",
            watchCount: 0,
          },
        ],
      ]),
    });

    expect(collectResumeHmrBoundaryIds(container, ["header-symbol"])).toEqual(["c0"]);
  });

  it("applies replacement-only payloads without requiring DOM rerender", async () => {
    const container = createContainer({
      imports: new Map([
        ["old-symbol", Promise.resolve({ default: () => null })],
      ]),
      symbols: new Map([
        ["old-symbol", "/app/+page.tsx?eclipsa-symbol=old-symbol"],
      ]),
    });

    const result = await applyResumeHmrUpdate(container, {
      fileUrl: "/app/+page.tsx",
      fullReload: false,
      rerenderComponentSymbols: [],
      rerenderOwnerSymbols: [],
      symbolUrlReplacements: {
        "old-symbol": "/app/+page.tsx?eclipsa-symbol=next-symbol",
      },
    });

    expect(result).toBe("updated");
    expect(container.symbols.get("next-symbol")).toBe("/app/+page.tsx?eclipsa-symbol=next-symbol");
  });
});

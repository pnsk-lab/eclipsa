import { describe, expect, it } from "vitest";

import {
  createBuildRouteUrl,
  createDevRouteUrl,
  createRouteManifest,
  normalizeRoutePath,
  type RouteEntry,
} from "./routing.ts";

describe("routing helpers", () => {
  it("normalizes route paths with a leading slash", () => {
    expect(normalizeRoutePath("counter")).toBe("/counter");
    expect(normalizeRoutePath("/counter/")).toBe("/counter");
    expect(normalizeRoutePath("/")).toBe("/");
  });

  it("creates a client manifest for dev and build route modules", () => {
    const routes: RouteEntry[] = [
      {
        entryName: "page",
        filePath: "/tmp/app/+page.tsx",
        honoPath: "/",
      },
      {
        entryName: "counter__page",
        filePath: "/tmp/app/counter/+page.tsx",
        honoPath: "/counter",
      },
    ];

    expect(createDevRouteUrl("/tmp", routes[1]!)).toBe("/app/counter/+page.tsx");
    expect(createBuildRouteUrl(routes[1]!)).toBe("/entries/route__counter__page.js");
    expect(createRouteManifest(routes, createBuildRouteUrl)).toEqual({
      "/": "/entries/route__page.js",
      "/counter": "/entries/route__counter__page.js",
    });
  });
});

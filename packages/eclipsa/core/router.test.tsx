import { describe, expect, it } from "vitest";

import { component$ } from "./component.ts";
import { __eclipsaComponent } from "./internal.ts";
import { useNavigate } from "./router.tsx";
import { renderSSR } from "./ssr.ts";

describe("useNavigate", () => {
  it("tracks the internal navigating signal when isNavigating is read during render", () => {
    const App = component$(
      __eclipsaComponent(() => {
        const navigate = useNavigate();
        return <button>{navigate.isNavigating ? "loading" : "idle"}</button>;
      }, "component-symbol", () => []),
    );

    const { html, payload } = renderSSR(() => <App />);

    expect(html).toContain("<button>idle</button>");
    expect(payload.signals["$router:isNavigating"]).toBe(false);
    expect(payload.subscriptions["$router:isNavigating"]).toEqual(["c0"]);
  });
});

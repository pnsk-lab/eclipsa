import type { ViteHotContext } from "vite/types/hot";
import type { Component } from "../component.ts";
import { useSignal } from "../signal.ts";
import type { JSX } from "../../jsx/jsx-runtime.ts";

export const initHot = (
  hot: ViteHotContext | undefined,
  stringURL: string,
  registry: HotRegistry,
) => {
  if (!hot) {
    return;
  }
  const url = new URL(stringURL);
  const id = url.pathname;

  const handler: Parameters<typeof hot.on>[1] = async (data) => {
    const hotTargetId: string = data.url;
    if (hotTargetId === id) {
      // Update module
      const newModURL = new URL(hotTargetId, stringURL);
      newModURL.searchParams.append("t", Date.now().toString());
      const newMod = await import(/* @vite-ignore */ newModURL.href);

      const newRegistry: HotRegistry | undefined = newMod.__eclipsa$hotRegistry;
      if (!newRegistry) {
        return;
      }
      newRegistry.setIsChild();
      for (const [name, newHotComponentData] of newRegistry.components) {
        const oldHotComponentData = registry.components.get(name);
        if (!oldHotComponentData) {
          // new component detected
          // full page reloading
          // TODO: without full page reloading
          console.info("[Eclipsa HMR]: New component detected, reloading page...");
          location.reload();
          continue;
        }
        if (oldHotComponentData.hash === newHotComponentData.hash) {
          // No change for this component
          // Do nothing
          continue;
        }
        // Run HMR
        oldHotComponentData.update(newHotComponentData.Component);
      }
      hot.on("update-client", handler);
    }
  };
  registry.setIsChild = () => {
    hot.off("update-client", handler);
  };
  hot.on("update-client", handler);
};

interface ComponentMetaInput {
  registry: HotRegistry;
  name: string;
}
export const defineHotComponent = (Component: Component, meta: ComponentMetaInput): Component => {
  const comp = useSignal(Component);

  const hash = Component.toString(); // TODO

  meta.registry.components.set(meta.name, {
    hash,
    update(newComponent) {
      comp.value = newComponent;
    },
    Component,
  });

  return (props) => {
    return () => comp.value(props);
  };
};

interface HotComponentData {
  hash: string;
  update(newComponent: Component): void;
  Component: Component;
}
interface HotRegistry {
  components: Map<string, HotComponentData>;
  setIsChild(): void;
}
export const createHotRegistry = (): HotRegistry => {
  return {
    components: new Map(),
    setIsChild: () => null,
  };
};

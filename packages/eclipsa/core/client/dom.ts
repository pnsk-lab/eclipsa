import type { Component } from "../component.ts";
import { getComponentMeta } from "../internal.ts";
import { bindRuntimeEvent, renderClientComponent } from "../runtime.ts";
import { effect } from "../signal.ts";
import { withSignalSnapshot } from "../snapshot.ts";
import type { ClientElementLike, Insertable } from "./types.ts";

export const createTemplate = (html: string): (() => Node) => {
  let template: HTMLTemplateElement | null = null;

  return () => {
    if (!template) {
      template = document.createElement("template");
      template.innerHTML = html;
    }
    return (template.cloneNode(true) as HTMLTemplateElement).content.firstChild as Node;
  };
};

export const insert = (value: Insertable, parent: Node, marker?: Node) => {
  let lastFirstNode = marker;
  let lastNodeLength = 0;

  effect(() => {
    let insertable = value;
    const newNodes: Node[] = [];
    const collectNodes = (input: Insertable) => {
      let resolved = input;
      while (typeof resolved === "function") {
        resolved = resolved();
      }

      if (Array.isArray(resolved)) {
        for (const entry of resolved) {
          collectNodes(entry);
        }
        return;
      }

      if (resolved === null || resolved === undefined || resolved === false) {
        newNodes.push(document.createComment("eclipsa-empty"));
      } else if (resolved instanceof Node) {
        newNodes.push(resolved);
      } else {
        newNodes.push(document.createTextNode(resolved.toString()));
      }
    };

    collectNodes(insertable);

    if (lastFirstNode && newNodes.length !== 0) {
      for (let i = 1; i < lastNodeLength; i++) {
        lastFirstNode.nextSibling?.remove();
      }
      parent.replaceChild(newNodes[0], lastFirstNode);
      for (let i = 1; i < newNodes.length; i++) {
        parent.insertBefore(newNodes[i], newNodes[i - 1].nextSibling);
      }
    } else {
      for (const node of newNodes) {
        parent.appendChild(node);
      }
    }

    lastFirstNode = newNodes[0];
    lastNodeLength = newNodes.length;
  });
};

const EVENT_ATTR_REGEX = /^on[A-Z].+\$$/;

export const attr = (elem: Element, name: string, value: () => unknown) => {
  if (EVENT_ATTR_REGEX.test(name)) {
    const eventName = name[2].toLowerCase() + name.slice(3, -1);
    const resolved = value();
    if (bindRuntimeEvent(elem, eventName, resolved)) {
      return;
    }
    if (typeof resolved !== "function") {
      throw new Error("Resumable event bindings require an active runtime container.");
    }
    elem.addEventListener(eventName, resolved as () => void);
    return;
  }

  if (name === "style") {
    effect(() => {
      const styleValue = Object.entries(value() as Record<string, string>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(";");
      elem.setAttribute("style", styleValue);
    });
    return;
  }

  if (name === "class") {
    effect(() => {
      elem.className = String(value());
    });
  }

  effect(() => {
    // @ts-expect-error DOM property assignment uses dynamic keys.
    elem[name] = String(value());
  });
};

export const hydrate = (
  Component: Component,
  target: HTMLElement,
  options?: {
    snapshot?: unknown[];
  },
) => {
  const elem = withSignalSnapshot(options?.snapshot ?? null, () => Component({})).result as unknown as
    ClientElementLike;

  while (target.childNodes.length > 0) {
    target.lastChild?.remove();
  }

  for (const entry of Array.isArray(elem) ? elem : [elem]) {
    insert(() => entry, target);
  }
};

export const createComponent = (Component: Component, props: unknown) => {
  if (!getComponentMeta(Component)) {
    return () => Component(props) as unknown as ClientElementLike;
  }
  const elem = renderClientComponent(Component, props);
  return () => elem as ClientElementLike;
};

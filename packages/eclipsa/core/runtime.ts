import type { JSX } from "../jsx/types.ts";
import { FRAGMENT } from "../jsx/shared.ts";
import type { Component } from "./component.ts";
import {
  getComponentMeta,
  getEventMeta,
  getLazyMeta,
  getSignalMeta,
  setSignalMeta,
  type EventDescriptor,
  type LazyMeta,
  type SignalMeta,
} from "./internal.ts";

const CONTAINER_STACK_KEY = Symbol.for("eclipsa.container-stack");
const FRAME_STACK_KEY = Symbol.for("eclipsa.frame-stack");
const DIRTY_FLUSH_PROMISE_KEY = Symbol.for("eclipsa.dirty-flush-promise");
const ROOT_COMPONENT_ID = "$root";

interface EncodedUndefined {
  __eclipsa_type: "undefined";
}

export type EncodedValue =
  | EncodedUndefined
  | null
  | boolean
  | number
  | string
  | EncodedValue[]
  | {
      [key: string]: EncodedValue;
    };

export interface ScopeSlot {
  kind: "signal";
  id: string;
}

export interface JSONScopeSlot {
  kind: "json";
  value: EncodedValue;
}

export interface SymbolScopeSlot {
  kind: "symbol";
  id: string;
  scope: string;
}

export type ResumeScopeSlot = ScopeSlot | JSONScopeSlot | SymbolScopeSlot;

export interface ResumeComponentPayload {
  props: EncodedValue;
  scope: string;
  signalIds: string[];
  symbol: string;
}

export interface ResumePayload {
  components: Record<string, ResumeComponentPayload>;
  scopes: Record<string, ResumeScopeSlot[]>;
  signals: Record<string, EncodedValue>;
  subscriptions: Record<string, string[]>;
  symbols: Record<string, string>;
}

interface SignalRecord<T = unknown> {
  effects: Set<ReactiveEffect>;
  handle: {
    value: T;
  };
  id: string;
  subscribers: Set<string>;
  value: T;
}

interface ComponentState {
  active: boolean;
  end?: Comment;
  id: string;
  parentId: string | null;
  props: unknown;
  scopeId: string;
  signalIds: string[];
  start?: Comment;
  symbol: string;
}

interface RenderFrame {
  childCursor: number;
  component: ComponentState;
  container: RuntimeContainer;
  visitedDescendants: Set<string>;
  mode: "client" | "ssr";
  signalCursor: number;
}

interface RuntimeContainer {
  components: Map<string, ComponentState>;
  dirty: Set<string>;
  doc?: Document;
  imports: Map<string, Promise<RuntimeSymbolModule>>;
  nextComponentId: number;
  nextElementId: number;
  nextScopeId: number;
  nextSignalId: number;
  rootChildCursor: number;
  rootElement?: HTMLElement;
  scopes: Map<string, ResumeScopeSlot[]>;
  signals: Map<string, SignalRecord>;
  symbols: Map<string, string>;
}

interface RuntimeSymbolModule {
  default: (scope: unknown[], propsOrArg?: unknown, ...args: unknown[]) => unknown;
}

interface ReactiveEffect {
  fn: () => void;
  signals: Set<SignalRecord>;
}

type RenderObject = Extract<
  JSX.Element,
  {
    isStatic: boolean;
    props: Record<string, unknown>;
    type: JSX.Type;
  }
>;

const getContainerStack = (): RuntimeContainer[] => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  const existing = globalRecord[CONTAINER_STACK_KEY];
  if (Array.isArray(existing)) {
    return existing as RuntimeContainer[];
  }
  const created: RuntimeContainer[] = [];
  globalRecord[CONTAINER_STACK_KEY] = created;
  return created;
};

const getFrameStack = (): RenderFrame[] => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  const existing = globalRecord[FRAME_STACK_KEY];
  if (Array.isArray(existing)) {
    return existing as RenderFrame[];
  }
  const created: RenderFrame[] = [];
  globalRecord[FRAME_STACK_KEY] = created;
  return created;
};

const getCurrentContainer = (): RuntimeContainer | null => {
  const stack = getContainerStack();
  return stack.length > 0 ? stack[stack.length - 1] : null;
};

const getCurrentFrame = (): RenderFrame | null => {
  const stack = getFrameStack();
  return stack.length > 0 ? stack[stack.length - 1] : null;
};

let currentEffect: ReactiveEffect | null = null;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const encodeValue = (value: unknown): EncodedValue => {
  if (value === undefined) {
    return { __eclipsa_type: "undefined" };
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Non-finite numbers cannot be serialized for resume.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => encodeValue(entry));
  }
  if (isPlainObject(value)) {
    const result: Record<string, EncodedValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = encodeValue(entry);
    }
    return result;
  }
  throw new TypeError(`Unsupported resumable value: ${Object.prototype.toString.call(value)}`);
};

const decodeValue = (value: EncodedValue): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => decodeValue(entry));
  }
  if (isPlainObject(value) && value.__eclipsa_type === "undefined") {
    return undefined;
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = decodeValue(entry);
    }
    return result;
  }
  return value;
};

const evaluateProps = (props: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(props))) {
    if (descriptor.get) {
      result[key] = descriptor.get.call(props);
    } else {
      result[key] = descriptor.value;
    }
  }
  return result;
};

const createContainer = (symbols: Record<string, string>, doc?: Document): RuntimeContainer => ({
  components: new Map(),
  dirty: new Set(),
  doc,
  imports: new Map(),
  nextComponentId: 0,
  nextElementId: 0,
  nextScopeId: 0,
  nextSignalId: 0,
  rootChildCursor: 0,
  rootElement: doc?.body,
  scopes: new Map(),
  signals: new Map(),
  symbols: new Map(Object.entries(symbols)),
});

const createSignalHandle = <T>(record: SignalRecord<T>, container: RuntimeContainer | null) => {
  const handle = {} as { value: T };
  Object.defineProperty(handle, "value", {
    configurable: true,
    enumerable: true,
    get() {
      recordSignalRead(record);
      return record.value;
    },
    set(value: T) {
      record.value = value;
      notifySignalWrite(container, record);
    },
  });
  setSignalMeta(handle, {
    get: () => record.value,
    id: record.id,
    set: (value) => {
      record.value = value;
      notifySignalWrite(container, record);
    },
  } satisfies SignalMeta<T>);
  return handle;
};

const ensureSignalRecord = <T>(
  container: RuntimeContainer | null,
  id: string,
  initialValue: T,
): SignalRecord<T> => {
  if (!container) {
    const record = {
      effects: new Set<ReactiveEffect>(),
      handle: undefined as unknown as { value: T },
      id,
      subscribers: new Set<string>(),
      value: initialValue,
    } satisfies SignalRecord<T>;
    record.handle = createSignalHandle(record, null);
    return record;
  }
  const existing = container.signals.get(id);
  if (existing) {
    return existing as SignalRecord<T>;
  }
  const record: SignalRecord<T> = {
    effects: new Set(),
    handle: undefined as unknown as { value: T },
    id,
    subscribers: new Set(),
    value: initialValue,
  };
  record.handle = createSignalHandle(record, container);
  container.signals.set(id, record as SignalRecord);
  return record;
};

const recordSignalRead = (record: SignalRecord) => {
  if (currentEffect) {
    currentEffect.signals.add(record);
    record.effects.add(currentEffect);
  }
  const frame = getCurrentFrame();
  if (!frame) {
    return;
  }
  record.subscribers.add(frame.component.id);
};

const notifySignalWrite = (container: RuntimeContainer | null, record: SignalRecord) => {
  for (const effect of record.effects) {
    effect.fn();
  }
  if (!container) {
    return;
  }
  for (const componentId of record.subscribers) {
    const component = container.components.get(componentId);
    if (component?.active) {
      continue;
    }
    container.dirty.add(componentId);
  }
};

const pushContainer = <T>(container: RuntimeContainer, fn: () => T): T => {
  const stack = getContainerStack();
  stack.push(container);
  try {
    return fn();
  } finally {
    stack.pop();
  }
};

export const withRuntimeContainer = pushContainer;

const pushFrame = <T>(frame: RenderFrame, fn: () => T): T => {
  const stack = getFrameStack();
  stack.push(frame);
  try {
    return fn();
  } finally {
    stack.pop();
  }
};

const allocateScopeId = (container: RuntimeContainer) => `sc${container.nextScopeId++}`;

const serializeScopeValue = (container: RuntimeContainer, value: unknown): ResumeScopeSlot => {
  const signalMeta = getSignalMeta(value);
  if (signalMeta) {
    return {
      kind: "signal",
      id: signalMeta.id,
    };
  }

  const lazyMeta = getLazyMeta(value);
  if (lazyMeta) {
    return {
      kind: "symbol",
      id: lazyMeta.symbol,
      scope: registerScope(container, lazyMeta.captures()),
    };
  }

  return {
    kind: "json",
    value: encodeValue(value),
  };
};

const registerScope = (container: RuntimeContainer, values: unknown[]): string => {
  const id = allocateScopeId(container);
  container.scopes.set(
    id,
    values.map((value) => serializeScopeValue(container, value)),
  );
  return id;
};

const materializeSymbolReference = (container: RuntimeContainer, symbolId: string, scopeId: string) => {
  const fn = (...args: unknown[]) => {
    void loadSymbol(container, symbolId).then((module) =>
      module.default(materializeScope(container, scopeId), ...args)
    );
  };
  Object.defineProperty(fn, "name", {
    configurable: true,
    value: `eclipsa$${symbolId}`,
  });
  return fn;
};

const materializeScope = (container: RuntimeContainer, scopeId: string): unknown[] => {
  const slots = container.scopes.get(scopeId);
  if (!slots) {
    throw new Error(`Missing scope ${scopeId}.`);
  }
  return slots.map((slot) => {
    if (slot.kind === "signal") {
      const record = container.signals.get(slot.id);
      if (!record) {
        throw new Error(`Missing signal ${slot.id}.`);
      }
      return record.handle;
    }
    if (slot.kind === "symbol") {
      return materializeSymbolReference(container, slot.id, slot.scope);
    }
    return decodeValue(slot.value);
  });
};

const createFrame = (
  container: RuntimeContainer,
  component: ComponentState,
  mode: RenderFrame["mode"],
): RenderFrame => ({
  childCursor: 0,
  component,
  container,
  mode,
  signalCursor: 0,
  visitedDescendants: new Set(),
});

const createComponentId = (container: RuntimeContainer, parentId: string | null, childIndex: number) => {
  if (!parentId || parentId === ROOT_COMPONENT_ID) {
    return `c${childIndex}`;
  }
  return `${parentId}.${childIndex}`;
};

const getOrCreateComponentState = (
  container: RuntimeContainer,
  id: string,
  symbol: string,
  parentId: string | null,
): ComponentState => {
  const existing = container.components.get(id);
  if (existing) {
    existing.parentId = parentId;
    existing.symbol = symbol;
    return existing;
  }
  const component: ComponentState = {
    active: false,
    id,
    parentId,
    props: {},
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol,
  };
  container.components.set(id, component);
  return component;
};

const clearComponentSubscriptions = (container: RuntimeContainer, componentId: string) => {
  for (const record of container.signals.values()) {
    record.subscribers.delete(componentId);
  }
};

const isDescendantOf = (parentId: string, candidateId: string) => candidateId.startsWith(`${parentId}.`);

const collectDescendantIds = (container: RuntimeContainer, componentId: string) =>
  [...container.components.keys()].filter((candidate) => isDescendantOf(componentId, candidate));

const pruneRemovedComponents = (
  container: RuntimeContainer,
  componentId: string,
  keep: Set<string>,
) => {
  for (const descendantId of collectDescendantIds(container, componentId)) {
    if (keep.has(descendantId)) {
      continue;
    }
    clearComponentSubscriptions(container, descendantId);
    container.components.delete(descendantId);
  }
};

const replaceBoundaryContents = (start: Comment, end: Comment, nodes: Node[]) => {
  let cursor = start.nextSibling;
  while (cursor && cursor !== end) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
  for (const node of nodes) {
    end.parentNode?.insertBefore(node, end);
  }
};

interface FocusSnapshot {
  path: number[];
  selectionDirection?: "backward" | "forward" | "none" | null;
  selectionEnd?: number | null;
  selectionStart?: number | null;
}

interface PendingFocusRestore {
  snapshot: FocusSnapshot;
}

const getBoundaryChildren = (start: Comment, end: Comment) => {
  const nodes: Node[] = [];
  let cursor = start.nextSibling;
  while (cursor && cursor !== end) {
    nodes.push(cursor);
    cursor = cursor.nextSibling;
  }
  return nodes;
};

const getNodePath = (root: Node, target: Node): number[] | null => {
  if (root === target) {
    return [];
  }

  const path: number[] = [];
  let cursor: Node | null = target;
  while (cursor && cursor !== root) {
    const parent: Node | null = cursor.parentNode;
    if (!parent) {
      return null;
    }
    const index = Array.prototype.indexOf.call(parent.childNodes, cursor);
    if (index < 0) {
      return null;
    }
    path.unshift(index);
    cursor = parent;
  }

  return cursor === root ? path : null;
};

const getNodeByPath = (root: Node, path: number[]) => {
  let cursor: Node | null = root;
  for (const index of path) {
    cursor = cursor?.childNodes.item(index) ?? null;
    if (!cursor) {
      return null;
    }
  }
  return cursor;
};

const getElementPath = (root: Element, target: Element): number[] | null => {
  if (root === target) {
    return [];
  }

  const path: number[] = [];
  let cursor: Element | null = target;
  while (cursor && cursor !== root) {
    const parent: HTMLElement | null = cursor.parentElement;
    if (!parent) {
      return null;
    }
    const index = Array.prototype.indexOf.call(parent.children, cursor);
    if (index < 0) {
      return null;
    }
    path.unshift(index);
    cursor = parent;
  }

  return cursor === root ? path : null;
};

const getElementByPath = (root: Element, path: number[]) => {
  let cursor: Element | null = root;
  for (const index of path) {
    cursor = (cursor?.children.item(index) as Element | null) ?? null;
    if (!cursor) {
      return null;
    }
  }
  return cursor;
};

const captureBoundaryFocus = (doc: Document, start: Comment, end: Comment): FocusSnapshot | null => {
  const activeElement = doc.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return null;
  }

  const topLevelNodes = getBoundaryChildren(start, end);
  for (let i = 0; i < topLevelNodes.length; i++) {
    const candidate = topLevelNodes[i];
    if (
      candidate !== activeElement &&
      (!(candidate instanceof Element) || !candidate.contains(activeElement))
    ) {
      continue;
    }

    const innerPath = getNodePath(candidate, activeElement);
    if (!innerPath) {
      continue;
    }

    return {
      path: [i, ...innerPath],
      selectionDirection:
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
          ? activeElement.selectionDirection
          : null,
      selectionEnd:
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
          ? activeElement.selectionEnd
          : null,
      selectionStart:
        activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
          ? activeElement.selectionStart
          : null,
    };
  }

  return null;
};

const restoreBoundaryFocus = (
  doc: Document,
  start: Comment,
  end: Comment,
  snapshot: FocusSnapshot | null,
) => {
  if (!snapshot) {
    return;
  }

  const [topLevelIndex, ...innerPath] = snapshot.path;
  const root = getBoundaryChildren(start, end)[topLevelIndex];
  if (!root) {
    return;
  }

  const nextActive = innerPath.length > 0 ? getNodeByPath(root, innerPath) : root;
  if (!(nextActive instanceof HTMLElement)) {
    return;
  }

  restoreFocusTarget(doc, nextActive, snapshot);
};

const restoreFocusTarget = (
  doc: Document,
  nextActive: HTMLElement,
  snapshot: FocusSnapshot,
) => {
  const restore = () => {
    if (!nextActive.isConnected) {
      return false;
    }
    nextActive.focus({ preventScroll: true });
    if (
      (nextActive instanceof HTMLInputElement || nextActive instanceof HTMLTextAreaElement) &&
      snapshot.selectionStart !== null &&
      snapshot.selectionStart !== undefined
    ) {
      nextActive.setSelectionRange(
        snapshot.selectionStart,
        snapshot.selectionEnd ?? snapshot.selectionStart,
        snapshot.selectionDirection ?? undefined,
      );
    }
    return doc.activeElement === nextActive;
  };

  if (restore()) {
    return;
  }

  const win = doc.defaultView;
  if (!win) {
    return;
  }

  let remainingAttempts = 3;
  const retry = () => {
    if (remainingAttempts <= 0) {
      return;
    }
    remainingAttempts--;
    const run = () => {
      if (restore()) {
        return;
      }
      retry();
    };

    if (typeof win.requestAnimationFrame === "function") {
      win.requestAnimationFrame(() => run());
      return;
    }
    win.setTimeout(run, 16);
  };

  retry();
};

const captureDocumentFocus = (doc: Document, focusSource?: EventTarget | null): FocusSnapshot | null => {
  const candidate =
    focusSource instanceof HTMLElement
      ? focusSource
      : doc.activeElement instanceof HTMLElement
        ? doc.activeElement
        : null;
  if (!candidate) {
    return null;
  }

  const path = getElementPath(doc.body, candidate);
  if (!path) {
    return null;
  }

  return {
    path,
    selectionDirection:
      candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement
        ? candidate.selectionDirection
        : null,
    selectionEnd:
      candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement
        ? candidate.selectionEnd
        : null,
    selectionStart:
      candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement
        ? candidate.selectionStart
        : null,
  };
};

const capturePendingFocusRestore = (
  container: RuntimeContainer,
  focusSource?: EventTarget | null,
): PendingFocusRestore | null => {
  if (!container.doc) {
    return null;
  }

  const snapshot = captureDocumentFocus(container.doc, focusSource);
  if (!snapshot) {
    return null;
  }
  return {
    snapshot,
  };
};

const restorePendingFocus = (container: RuntimeContainer, pending: PendingFocusRestore | null) => {
  if (!pending || !container.doc) {
    return;
  }

  const nextActive = getElementByPath(container.doc.body, pending.snapshot.path);
  if (!(nextActive instanceof HTMLElement)) {
    return;
  }

  restoreFocusTarget(container.doc, nextActive, pending.snapshot);
};

const htmlToNodes = (doc: Document, html: string) => {
  const template = doc.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.childNodes);
};

const EVENT_PROP_REGEX = /^on([A-Z].+)\$$/;

const toEventName = (propName: string) => {
  const matched = propName.match(EVENT_PROP_REGEX);
  if (!matched) {
    return null;
  }
  const [first, ...rest] = matched[1];
  return `${first.toLowerCase()}${rest.join("")}`;
};

const escapeText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const escapeAttr = (value: string) =>
  escapeText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const resolveRenderable = (value: JSX.Element): JSX.Element => {
  let current = value;
  while (typeof current === "function" && !getLazyMeta(current) && !getComponentMeta(current)) {
    current = current();
  }
  return current;
};

const isRenderObject = (value: JSX.Element): value is RenderObject =>
  typeof value === "object" && value !== null && "type" in value && "props" in value;

const nextComponentPosition = (container: RuntimeContainer) => {
  const frame = getCurrentFrame();
  if (!frame) {
    return {
      childIndex: container.rootChildCursor++,
      parentId: ROOT_COMPONENT_ID,
    };
  }
  return {
    childIndex: frame.childCursor++,
    parentId: frame.component.id,
  };
};

const registerEventBinding = (
  container: RuntimeContainer,
  descriptor: EventDescriptor | LazyMeta,
): string => {
  const scopeId = registerScope(container, descriptor.captures());
  return `${descriptor.symbol}:${scopeId}`;
};

export const bindRuntimeEvent = (
  element: Element,
  eventName: string,
  value: unknown,
): boolean => {
  const descriptor = getEventMeta(value);
  if (!descriptor) {
    return false;
  }

  const container = getCurrentContainer();
  if (!container) {
    return false;
  }

  element.setAttribute("data-eid", `e${container.nextElementId++}`);
  element.setAttribute(`data-e-on${eventName}`, registerEventBinding(container, descriptor));
  return true;
};

const renderStringNode = (inputElementLike: JSX.Element | JSX.Element[]): string => {
  if (Array.isArray(inputElementLike)) {
    return inputElementLike.map((entry) => renderStringNode(entry)).join("");
  }

  const resolved = resolveRenderable(inputElementLike as JSX.Element);
  if (resolved === false || resolved === null || resolved === undefined) {
    return "";
  }
  if (Array.isArray(resolved)) {
    return renderStringNode(resolved);
  }
  if (typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "boolean") {
    return escapeText(String(resolved));
  }
  if (!isRenderObject(resolved)) {
    return "";
  }

  if (typeof resolved.type === "function") {
    const container = getCurrentContainer();
    const meta = getComponentMeta(resolved.type);
    if (!meta || !container) {
      return renderStringNode(resolved.type(resolved.props));
    }

    const evaluatedProps = evaluateProps(resolved.props);
    const position = nextComponentPosition(container);
    const componentId = createComponentId(container, position.parentId, position.childIndex);
    const component = getOrCreateComponentState(container, componentId, meta.symbol, position.parentId);
    component.scopeId = registerScope(container, meta.captures());
    component.props = evaluatedProps;
    const frame = createFrame(container, component, "ssr");
    clearComponentSubscriptions(container, component.id);

    const componentFn = resolved.type as Component;
    const body = pushFrame(frame, () => renderStringNode(componentFn(evaluatedProps)));
    return `<!--ec:c:${componentId}:start-->${body}<!--ec:c:${componentId}:end-->`;
  }

  const attrParts: string[] = [];
  const descriptors = Object.getOwnPropertyDescriptors(resolved.props);
  const container = getCurrentContainer();

  for (const [name, descriptor] of Object.entries(descriptors) as [string, PropertyDescriptor][]) {
    if (name === "children") {
      continue;
    }

    const eventName = toEventName(name);
    const value = descriptor.get ? descriptor.get.call(resolved.props) : descriptor.value;

    if (eventName) {
      const eventMeta = getEventMeta(value);
      if (!eventMeta || !container) {
        continue;
      }
      attrParts.push(`data-eid="e${container.nextElementId++}"`);
      attrParts.push(`data-e-on${eventName}="${escapeAttr(registerEventBinding(container, eventMeta))}"`);
      continue;
    }

    if (value === false || value === undefined || value === null) {
      continue;
    }

    if (resolved.type === "body" && name === "data-e-resume") {
      continue;
    }

    if (value === true) {
      attrParts.push(name);
      continue;
    }

    attrParts.push(`${name}="${escapeAttr(String(value))}"`);
  }

  if (resolved.type === "body" && container) {
    attrParts.push('data-e-resume="paused"');
  }

  let childrenText = "";
  const children = resolved.props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      childrenText += renderStringNode(child);
    }
  } else {
    childrenText += renderStringNode(children as JSX.Element);
  }

  if (resolved.type === FRAGMENT) {
    return childrenText;
  }

  return `<${resolved.type}${attrParts.length > 0 ? ` ${attrParts.join(" ")}` : ""}>${childrenText}</${
    resolved.type
  }>`;
};

const createElementNode = (doc: Document, tagName: string) => doc.createElement(tagName);

const renderComponentToNodes = (
  componentFn: Component,
  props: Record<string, unknown>,
  container: RuntimeContainer,
  mode: RenderFrame["mode"],
): Node[] => {
  if (!container.doc) {
    throw new Error("Client rendering requires a document.");
  }
  const meta = getComponentMeta(componentFn);
  if (!meta) {
    return renderClientNodes(componentFn(props), container);
  }

  const position = nextComponentPosition(container);
  const componentId = createComponentId(container, position.parentId, position.childIndex);
  const component = getOrCreateComponentState(container, componentId, meta.symbol, position.parentId);
  component.scopeId = registerScope(container, meta.captures());
  component.props = props;
  const frame = createFrame(container, component, mode);
  clearComponentSubscriptions(container, componentId);
  const oldDescendants = collectDescendantIds(container, componentId);
  const start = container.doc.createComment(`ec:c:${componentId}:start`);
  const end = container.doc.createComment(`ec:c:${componentId}:end`);
  component.start = start;
  component.end = end;
  const rendered = pushFrame(frame, () => renderClientNodes(componentFn(props), container));
  pruneRemovedComponents(container, componentId, frame.visitedDescendants);

  for (const descendantId of oldDescendants) {
    if (frame.visitedDescendants.has(descendantId)) {
      continue;
    }
    clearComponentSubscriptions(container, descendantId);
  }

  const currentFrame = getCurrentFrame();
  if (currentFrame) {
    currentFrame.visitedDescendants.add(componentId);
    for (const descendantId of frame.visitedDescendants) {
      currentFrame.visitedDescendants.add(descendantId);
    }
  }

  return [start, ...rendered, end];
};

const applyElementProp = (
  element: HTMLElement,
  name: string,
  value: unknown,
  container: RuntimeContainer,
) => {
  const eventName = toEventName(name);
  if (eventName) {
    const eventMeta = getEventMeta(value);
    if (!eventMeta) {
      return;
    }
    element.setAttribute("data-eid", `e${container.nextElementId++}`);
    element.setAttribute(`data-e-on${eventName}`, registerEventBinding(container, eventMeta));
    return;
  }

  if (value === false || value === undefined || value === null) {
    return;
  }

  if (name === "class") {
    element.className = String(value);
    return;
  }

  if (name === "style" && isPlainObject(value)) {
    element.setAttribute(
      "style",
      Object.entries(value)
        .map(([styleName, styleValue]) => `${styleName}: ${styleValue}`)
        .join("; "),
    );
    return;
  }

  if (name === "value" && "value" in element) {
    (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(value);
  }
  if (name === "checked" && element instanceof HTMLInputElement) {
    element.checked = Boolean(value);
  }

  if (value === true) {
    element.setAttribute(name, "");
    return;
  }

  element.setAttribute(name, String(value));
};

export const renderClientNodes = (
  inputElementLike: JSX.Element | JSX.Element[],
  container: RuntimeContainer,
): Node[] => {
  if (!container.doc) {
    throw new Error("Client rendering requires a document.");
  }
  if (Array.isArray(inputElementLike)) {
    return inputElementLike.flatMap((entry) => renderClientNodes(entry, container));
  }

  const resolved = resolveRenderable(inputElementLike as JSX.Element);
  if (resolved === false || resolved === null || resolved === undefined) {
    return [];
  }
  if (Array.isArray(resolved)) {
    return renderClientNodes(resolved, container);
  }
  if (typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "boolean") {
    return [container.doc.createTextNode(String(resolved))];
  }
  if (!isRenderObject(resolved)) {
    return [];
  }

  if (typeof resolved.type === "function") {
    const evaluatedProps = evaluateProps(resolved.props);
    return renderComponentToNodes(resolved.type, evaluatedProps, container, "client");
  }

  if (resolved.type === FRAGMENT) {
    const children = resolved.props.children;
    return Array.isArray(children)
      ? children.flatMap((child: JSX.Element) => renderClientNodes(child, container))
      : renderClientNodes(children as JSX.Element, container);
  }

  const element = createElementNode(container.doc, resolved.type);
  for (
    const [name, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(resolved.props),
    ) as [string, PropertyDescriptor][]
  ) {
    if (name === "children") {
      continue;
    }
    const value = descriptor.get ? descriptor.get.call(resolved.props) : descriptor.value;
    if (resolved.type === "body" && name === "data-e-resume") {
      continue;
    }
    applyElementProp(element, name, value, container);
  }

  const children = resolved.props.children;
  const childNodes = Array.isArray(children)
    ? children.flatMap((child: JSX.Element) => renderClientNodes(child, container))
    : renderClientNodes(children as JSX.Element, container);
  for (const child of childNodes) {
    element.appendChild(child);
  }

  return [element];
};

const scanComponentBoundaries = (root: HTMLElement): Map<string, { end?: Comment; start?: Comment }> => {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const boundaries = new Map<string, { end?: Comment; start?: Comment }>();

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Comment)) {
      continue;
    }
    const matched = node.data.match(/^ec:c:(.+):(start|end)$/);
    if (!matched) {
      continue;
    }
    const [, id, edge] = matched;
    const boundary = boundaries.get(id) ?? {};
    if (edge === "start") {
      boundary.start = node;
    } else {
      boundary.end = node;
    }
    boundaries.set(id, boundary);
  }

  return boundaries;
};

const loadSymbol = async (container: RuntimeContainer, symbolId: string): Promise<RuntimeSymbolModule> => {
  const existing = container.imports.get(symbolId);
  if (existing) {
    return existing;
  }

  const url = container.symbols.get(symbolId);
  if (!url) {
    throw new Error(`Missing symbol URL for ${symbolId}.`);
  }

  const loaded = import(/* @vite-ignore */ url) as Promise<RuntimeSymbolModule>;
  container.imports.set(symbolId, loaded);
  return loaded;
};

const toMountedNodes = (
  value: unknown,
  container: RuntimeContainer,
): Node[] => {
  if (!container.doc) {
    throw new Error("Client rendering requires a document.");
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toMountedNodes(entry, container));
  }
  if (value === null || value === undefined || value === false) {
    return [container.doc.createComment("eclipsa-empty")];
  }
  if (value instanceof Node) {
    return [value];
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [container.doc.createTextNode(String(value))];
  }
  return renderClientNodes(value as JSX.Element | JSX.Element[], container);
};

export const renderClientComponent = <T>(componentFn: Component<T>, props: T): unknown => {
  const container = getCurrentContainer();
  const parentFrame = getCurrentFrame();
  const meta = getComponentMeta(componentFn);

  if (!container || !parentFrame || !meta) {
    return componentFn(props);
  }

  const position = nextComponentPosition(container);
  const componentId = createComponentId(container, position.parentId, position.childIndex);
  const existing = container.components.get(componentId);
  const component = getOrCreateComponentState(container, componentId, meta.symbol, position.parentId);
  component.props =
    props && typeof props === "object" ? evaluateProps(props as Record<string, unknown>) : (props as unknown);
  if (!existing) {
    component.scopeId = registerScope(container, meta.captures());
  }
  component.active = true;
  component.start = undefined;
  component.end = undefined;

  const frame = createFrame(container, component, "client");
  const oldDescendants = collectDescendantIds(container, componentId);
  clearComponentSubscriptions(container, componentId);
  const rendered = pushFrame(frame, () => componentFn(props));
  pruneRemovedComponents(container, componentId, frame.visitedDescendants);

  for (const descendantId of oldDescendants) {
    if (frame.visitedDescendants.has(descendantId)) {
      continue;
    }
    clearComponentSubscriptions(container, descendantId);
  }

  parentFrame.visitedDescendants.add(componentId);
  for (const descendantId of frame.visitedDescendants) {
    parentFrame.visitedDescendants.add(descendantId);
  }

  return rendered;
};

const activateComponent = async (container: RuntimeContainer, componentId: string) => {
  const component = container.components.get(componentId);
  if (!component?.start || !component.end || component.active) {
    return;
  }

  clearComponentSubscriptions(container, componentId);
  const oldDescendants = collectDescendantIds(container, componentId);
  const scope = materializeScope(container, component.scopeId);
  const module = await loadSymbol(container, component.symbol);
  const frame = createFrame(container, component, "client");
  const focusSnapshot = captureBoundaryFocus(container.doc!, component.start, component.end);
  const rendered = pushContainer(container, () =>
    pushFrame(frame, () => module.default(scope, component.props))
  );
  const nodes = toMountedNodes(rendered, container);
  replaceBoundaryContents(component.start, component.end, nodes);
  restoreBoundaryFocus(container.doc!, component.start, component.end, focusSnapshot);

  component.active = true;
  for (const descendantId of frame.visitedDescendants) {
    const descendant = container.components.get(descendantId);
    if (!descendant) {
      continue;
    }
    descendant.active = true;
    descendant.start = undefined;
    descendant.end = undefined;
  }

  pruneRemovedComponents(container, componentId, frame.visitedDescendants);

  for (const descendantId of oldDescendants) {
    if (frame.visitedDescendants.has(descendantId)) {
      continue;
    }
    clearComponentSubscriptions(container, descendantId);
  }
  clearComponentSubscriptions(container, componentId);
};

const sortDirtyComponents = (ids: Iterable<string>) =>
  [...ids].sort((a, b) => a.split(".").length - b.split(".").length);

export const flushDirtyComponents = async (container: RuntimeContainer) => {
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  const existing = globalRecord[DIRTY_FLUSH_PROMISE_KEY];
  if (existing instanceof Promise) {
    await existing;
    return;
  }

  const flushing = (async () => {
    while (container.dirty.size > 0) {
      const batch = sortDirtyComponents(container.dirty);
      container.dirty.clear();
      const rerendered = new Set<string>();
      for (const componentId of batch) {
        if ([...rerendered].some((parentId) => componentId === parentId || isDescendantOf(parentId, componentId))) {
          continue;
        }
        const component = container.components.get(componentId);
        if (component?.active) {
          continue;
        }
        await activateComponent(container, componentId);
        rerendered.add(componentId);
      }
    }
  })();

  globalRecord[DIRTY_FLUSH_PROMISE_KEY] = flushing;
  try {
    await flushing;
  } finally {
    delete globalRecord[DIRTY_FLUSH_PROMISE_KEY];
  }
};

export const beginSSRContainer = <T>(
  symbols: Record<string, string>,
  render: () => T,
): {
  container: RuntimeContainer;
  result: T;
} => {
  const container = createContainer(symbols);
  const rootComponent: ComponentState = {
    active: false,
    id: ROOT_COMPONENT_ID,
    parentId: null,
    props: {},
    scopeId: registerScope(container, []),
    signalIds: [],
    symbol: ROOT_COMPONENT_ID,
  };

  const rootFrame = createFrame(container, rootComponent, "ssr");
  const result = pushContainer(container, () => pushFrame(rootFrame, render));
  return {
    container,
    result,
  };
};

export const toResumePayload = (container: RuntimeContainer): ResumePayload => ({
  components: Object.fromEntries(
    [...container.components.entries()].map(([id, component]) => [
      id,
      {
        props: encodeValue(component.props),
        scope: component.scopeId,
        signalIds: [...component.signalIds],
        symbol: component.symbol,
      } satisfies ResumeComponentPayload,
    ]),
  ),
  scopes: Object.fromEntries(container.scopes.entries()),
  signals: Object.fromEntries(
    [...container.signals.entries()].map(([id, record]) => [id, encodeValue(record.value)]),
  ),
  subscriptions: Object.fromEntries(
    [...container.signals.entries()].map(([id, record]) => [id, [...record.subscribers]]),
  ),
  symbols: Object.fromEntries(container.symbols.entries()),
});

export const createResumeContainer = (source: Document | HTMLElement, payload: ResumePayload) => {
  const doc = source instanceof Document ? source : source.ownerDocument;
  const root = source instanceof Document ? doc.body : source;
  const container = createContainer(payload.symbols, doc);
  container.rootElement = root as HTMLElement;

  for (const [id, encodedValue] of Object.entries(payload.signals)) {
    const decodedValue = decodeValue(encodedValue);
    const record = ensureSignalRecord(container, id, decodedValue);
    record.value = decodedValue;
  }

  for (const [id, slots] of Object.entries(payload.scopes)) {
    container.scopes.set(id, slots);
  }

  for (const [id, componentPayload] of Object.entries(payload.components)) {
    container.components.set(id, {
      active: false,
      id,
      parentId: id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : ROOT_COMPONENT_ID,
      props: decodeValue(componentPayload.props),
      scopeId: componentPayload.scope,
      signalIds: [...componentPayload.signalIds],
      symbol: componentPayload.symbol,
    });
  }

  for (const [signalId, subscribers] of Object.entries(payload.subscriptions)) {
    const record = container.signals.get(signalId);
    if (!record) {
      continue;
    }
    record.subscribers = new Set(subscribers);
  }

  for (const [id, boundary] of scanComponentBoundaries(root as HTMLElement)) {
    const component = container.components.get(id);
    if (!component) {
      continue;
    }
    component.start = boundary.start;
    component.end = boundary.end;
  }

  return container;
};

const findInteractiveTarget = (target: EventTarget | null, eventName: string): Element | null => {
  let element = target instanceof Element ? target : null;
  while (element) {
    if (element.hasAttribute(`data-e-on${eventName}`)) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
};

const parseBinding = (value: string): { scopeId: string; symbolId: string } => {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex < 0) {
    throw new Error(`Invalid binding ${value}.`);
  }
  return {
    symbolId: value.slice(0, separatorIndex),
    scopeId: value.slice(separatorIndex + 1),
  };
};

const withClientContainer = async <T>(container: RuntimeContainer, fn: () => Promise<T> | T) =>
  pushContainer(container, () => Promise.resolve(fn()));

const createDelegatedEvent = (event: Event, currentTarget: Element) =>
  Object.create(event, {
    currentTarget: {
      value: currentTarget,
    },
  }) as Event;

export const createClientLazyListener = (descriptor: EventDescriptor | LazyMeta, currentTarget: Element) => {
  const container = getCurrentContainer();
  if (!container) {
    return null;
  }

  return async (event: Event) => {
    const module = await loadSymbol(container, descriptor.symbol);
    await withClientContainer(container, async () => {
      await module.default(descriptor.captures(), createDelegatedEvent(event, currentTarget));
    });
    await flushDirtyComponents(container);
  };
};

export const dispatchResumeEvent = async (
  container: RuntimeContainer,
  event: Event,
) => {
  const interactiveTarget = findInteractiveTarget(event.target, event.type);
  if (!interactiveTarget) {
    return;
  }
  const pendingFocus = capturePendingFocusRestore(container, event.target);

  const binding = interactiveTarget.getAttribute(`data-e-on${event.type}`);
  if (!binding) {
    return;
  }

  const { scopeId, symbolId } = parseBinding(binding);
  const module = await loadSymbol(container, symbolId);
  await withClientContainer(container, async () => {
    await module.default(materializeScope(container, scopeId), createDelegatedEvent(event, interactiveTarget));
  });
  await flushDirtyComponents(container);
  restorePendingFocus(container, pendingFocus);
};

export const installResumeListeners = (container: RuntimeContainer) => {
  const doc = container.doc;
  if (!doc) {
    return () => {};
  }
  const listeners = ["click", "input", "change", "submit"] as const;
  const onEvent = (event: Event) => {
    void dispatchResumeEvent(container, event);
  };

  for (const eventName of listeners) {
    doc.addEventListener(eventName, onEvent, true);
  }

  return () => {
    for (const eventName of listeners) {
      doc.removeEventListener(eventName, onEvent, true);
    }
  };
};

export const renderString = (inputElementLike: JSX.Element | JSX.Element[]) => renderStringNode(inputElementLike);

export const useRuntimeSignal = <T>(fallback: T): { value: T } => {
  const container = getCurrentContainer();
  const frame = getCurrentFrame();

  if (!container || !frame || frame.component.id === ROOT_COMPONENT_ID) {
    const standaloneId = `standalone:${Math.random().toString(36).slice(2)}`;
    const record = ensureSignalRecord(null, standaloneId, fallback);
    return record.handle;
  }

  const signalIndex = frame.signalCursor++;
  const existingId = frame.component.signalIds[signalIndex];
  const signalId = existingId ?? `s${container.nextSignalId++}`;
  if (!existingId) {
    frame.component.signalIds.push(signalId);
  }
  const record = ensureSignalRecord(container, signalId, fallback);
  recordSignalRead(record);
  return record.handle;
};

export const createEffect = (fn: () => void) => {
  const effect: ReactiveEffect = {
    fn() {
      currentEffect = effect;
      try {
        fn();
      } finally {
        currentEffect = null;
      }
    },
    signals: new Set(),
  };

  effect.fn();
};

export const getResumePayloadScriptContent = (payload: ResumePayload) => JSON.stringify(payload);

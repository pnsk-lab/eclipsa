import type { Component, EURL } from "./component.ts";

const COMPONENT_META_KEY = Symbol.for("eclipsa.component-meta");
const LAZY_META_KEY = Symbol.for("eclipsa.lazy-meta");
const SIGNAL_META_KEY = Symbol.for("eclipsa.signal-meta");
const WATCH_META_KEY = Symbol.for("eclipsa.watch-meta");

export interface ComponentMeta {
  captures: () => unknown[];
  symbol: string;
}

export interface LazyMeta {
  captures: () => unknown[];
  eventName?: string;
  symbol: string;
}

export interface WatchMeta {
  captures: () => unknown[];
  symbol: string;
}

export interface SignalMeta<T = unknown> {
  get(): T;
  id: string;
  set(value: T): void;
}

export interface EventDescriptor {
  captures: () => unknown[];
  eventName?: string;
  symbol: string;
}

export interface LazyReference<T extends (...args: any[]) => unknown = (...args: any[]) => unknown>
  extends Function {
  (...args: Parameters<T>): ReturnType<T>;
  [LAZY_META_KEY]?: LazyMeta;
}

export interface WatchReference<T extends (...args: any[]) => unknown = (...args: any[]) => unknown>
  extends Function {
  (...args: Parameters<T>): ReturnType<T>;
  [WATCH_META_KEY]?: WatchMeta;
}

export const __eclipsaComponent = <T>(
  component: Component<T>,
  symbol: string,
  captures: () => unknown[],
): Component<T> => {
  Object.defineProperty(component, COMPONENT_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      symbol,
      captures,
    } satisfies ComponentMeta,
    writable: true,
  });
  return component;
};

export const __eclipsaLazy = <T extends (...args: any[]) => unknown>(
  symbol: string,
  fn: T,
  captures: () => unknown[],
): EURL<T> => {
  const wrapped = ((...args: Parameters<T>) => fn(...args)) as LazyReference<T>;
  Object.defineProperty(wrapped, LAZY_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      symbol,
      captures,
    } satisfies LazyMeta,
    writable: true,
  });
  return wrapped as EURL<T>;
};

export const __eclipsaWatch = <T extends (...args: any[]) => unknown>(
  symbol: string,
  fn: T,
  captures: () => unknown[],
): T => {
  const wrapped = ((...args: Parameters<T>) => fn(...args)) as WatchReference<T>;
  Object.defineProperty(wrapped, WATCH_META_KEY, {
    configurable: true,
    enumerable: false,
    value: {
      symbol,
      captures,
    } satisfies WatchMeta,
    writable: true,
  });
  return wrapped as T;
};

export const __eclipsaEvent = (
  eventName: string,
  symbol: string,
  captures: () => unknown[],
): EventDescriptor => ({
  eventName,
  symbol,
  captures,
});

export const getComponentMeta = (value: unknown): ComponentMeta | null => {
  if (typeof value !== "function") {
    return null;
  }
  return (
    ((value as unknown as Record<PropertyKey, unknown>)[COMPONENT_META_KEY] as ComponentMeta | undefined) ??
    null
  );
};

export const getLazyMeta = (value: unknown): LazyMeta | null => {
  if (typeof value !== "function") {
    return null;
  }
  return ((value as unknown as Record<PropertyKey, unknown>)[LAZY_META_KEY] as LazyMeta | undefined) ??
    null;
};

export const getWatchMeta = (value: unknown): WatchMeta | null => {
  if (typeof value !== "function") {
    return null;
  }
  return ((value as unknown as Record<PropertyKey, unknown>)[WATCH_META_KEY] as WatchMeta | undefined) ??
    null;
};

export const getEventMeta = (value: unknown): EventDescriptor | LazyMeta | null => {
  if (value && typeof value === "object") {
    const descriptor = value as EventDescriptor;
    if (typeof descriptor.symbol === "string" && typeof descriptor.captures === "function") {
      return descriptor;
    }
  }
  return getLazyMeta(value);
};

export const setSignalMeta = <T>(
  target: { value: T },
  meta: SignalMeta<T>,
): { value: T } => {
  Object.defineProperty(target, SIGNAL_META_KEY, {
    configurable: true,
    enumerable: false,
    value: meta,
    writable: true,
  });
  return target;
};

export const getSignalMeta = <T>(value: unknown): SignalMeta<T> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return ((value as Record<PropertyKey, unknown>)[SIGNAL_META_KEY] as SignalMeta<T> | undefined) ??
    null;
};

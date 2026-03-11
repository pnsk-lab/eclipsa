import { createEffect, createOnMount, createWatch, useRuntimeSignal } from "./runtime.ts";

export interface Signal<T> {
  value: T;
}

interface UseSignal {
  <T>(value: T): Signal<T>;
  <T>(value?: T | undefined): Signal<T | undefined>;
}

export type WatchDependency<T = unknown> = Signal<T> | (() => T);

export const useSignal: UseSignal = (value) => useRuntimeSignal(value);

export const effect = createEffect;
export const onMount = createOnMount;
export const useWatch = createWatch as (fn: () => void, dependencies?: WatchDependency[]) => void;

export const useComputed$ = <T>(fn: () => T) => {
  const result = useSignal<T>();

  effect(() => {
    result.value = fn();
  });

  return result as Signal<T>;
};

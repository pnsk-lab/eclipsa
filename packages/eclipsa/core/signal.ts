import { createEffect, useRuntimeSignal } from "./runtime.ts";

interface Signal<T> {
  value: T;
}

interface UseSignal {
  <T>(value: T): Signal<T>;
  <T>(value?: T | undefined): Signal<T | undefined>;
}

export const useSignal: UseSignal = (value) => useRuntimeSignal(value);

export const effect = createEffect;

export const useComputed = <T>(fn: () => T) => {
  const result = useSignal<T>();

  effect(() => {
    result.value = fn();
  });

  return result as Signal<T>;
};

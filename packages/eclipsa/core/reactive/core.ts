export interface Signal<T> {
  get(): T;
  set(newValue: T): T;
  effects: Set<Effect>;
}

interface Effect {
  fn: () => void;
  signals: Set<Signal<unknown>>;
}
let currentEffect: Effect | null = null;

export const signal = <T>(init: T): Signal<T> => {
  let value = init;
  const signal: Signal<T> = {
    get() {
      if (currentEffect) {
        this.effects.add(currentEffect);
      }
      return value;
    },
    set(newValue) {
      value = newValue;
      for (const effect of this.effects) {
        effect.fn();
      }
      return value;
    },
    effects: new Set(),
  };
  return signal;
};

const registry = new FinalizationRegistry<Effect>((effect) => {
  for (const signal of effect.signals) {
    signal.effects.delete(effect);
  }
});

export const effect = (fn: () => void) => {
  const newEffect: Effect = {
    fn() {
      fn();
    },
    signals: new Set(),
  };

  currentEffect = newEffect;
  newEffect.fn();
  currentEffect = null;

  registry.register(fn, newEffect);
};

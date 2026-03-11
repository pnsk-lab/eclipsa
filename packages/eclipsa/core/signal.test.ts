import { expect, it, describe } from "vitest";

import { useSignal, watch$ } from "./signal.ts";

describe("watch$", () => {
  it("auto-tracks callback reads when dependencies are omitted", () => {
    const tracked = useSignal(0);
    const untracked = useSignal("a");
    const values: string[] = [];

    watch$(() => {
      values.push(`${tracked.value}:${untracked.value}`);
    });

    untracked.value = "b";
    tracked.value = 1;

    expect(values).toEqual(["0:a", "0:b", "1:b"]);
  });

  it("re-runs only for explicitly listed signal dependencies", () => {
    const tracked = useSignal(0);
    const untracked = useSignal("a");
    const values: string[] = [];

    watch$(() => {
      values.push(untracked.value);
    }, [tracked]);

    untracked.value = "b";
    tracked.value = 1;

    expect(values).toEqual(["a", "b"]);
  });

  it("accepts getter dependencies without auto-tracking callback reads", () => {
    const tracked = useSignal(0);
    const untracked = useSignal("a");
    const values: string[] = [];

    watch$(() => {
      values.push(untracked.value);
    }, [() => tracked.value]);

    untracked.value = "b";
    tracked.value = 1;

    expect(values).toEqual(["a", "b"]);
  });
});

// @ts-types="@types/babel__core"
import { transform } from "@babel/core";
import { describe, expect, it } from "vitest";
import { pluginClientDevJSX } from "./plugin.ts";

describe("pluginClientDevJSX", () => {
  it("injects the runtime helpers and template setup", () => {
    const resultCode = transform(
      `<div a="a">
        <Header a="a" />
      </div>`,
      {
        filename: "plugin.test.tsx",
        parserOpts: {
          plugins: ["jsx"],
        },
        plugins: [pluginClientDevJSX()],
      },
    )?.code;

    expect(resultCode).toBeTruthy();
    expect(resultCode).toContain('from "eclipsa/dev-client"');
    expect(resultCode).toContain("createTemplate");
    expect(resultCode).toContain("createComponent");
  });
});

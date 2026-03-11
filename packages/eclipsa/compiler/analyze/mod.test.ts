import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { analyzeModule } from "./mod.ts";

describe("analyzeModule()", () => {
  it("matches the stored analyze snapshots", async () => {
    const analyzeDir = path.dirname(fileURLToPath(import.meta.url));
    const testsDir = path.join(analyzeDir, "tests");
    const entries = await fs.readdir(testsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(testsDir, entry.name);
      const tsx = await fs.readFile(filePath, "utf8");
      const analyzed = await analyzeModule(tsx);

      if (!analyzed) {
        continue;
      }

      let snapshot = `// ================= ENTRY (${entry.name}) ==\n${tsx}\n\n`;
      snapshot += `// ================= analyzed ==\n${analyzed.code}\n\n`;

      for (const [name, symbol] of analyzed.symbols) {
        snapshot += `// ================= ${name} (${symbol.kind}) ==\n${symbol.code}\n\n`;
      }

      const snapshotPath = path.join(analyzeDir, "snapshots", `${entry.name}.snap`);
      expect(snapshot.trimEnd()).toBe((await fs.readFile(snapshotPath, "utf8")).trimEnd());
    }
  });
});

import { expect, test } from "bun:test";
import { codingTools } from "./codingTools";

test("run_shell keeps only the tail of huge output", async () => {
  const out = await codingTools(process.cwd()).run_shell!.execute({ command: "head -c 300000 /dev/zero | tr '\\0' a; echo END" });
  expect(out).toContain("output truncated");
  expect(out.endsWith("END\n")).toBe(true);
  expect(out.length).toBeLessThan(101_000);
});

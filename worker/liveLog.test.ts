import { describe, expect, test } from "bun:test";
import { createLiveLog } from "./liveLog";

describe("createLiveLog", () => {
  test("batches pushes into one write on close", async () => {
    const writes: string[] = [];
    const log = createLiveLog(async (text) => {
      writes.push(text);
    });
    log.push("hel");
    log.push("lo");
    log.push("!");
    await log.close();
    expect(writes).toEqual(["hello!"]);
  });

  test("flushes on timer while open", async () => {
    const writes: string[] = [];
    const log = createLiveLog(async (text) => {
      writes.push(text);
    });
    log.push("ab");
    log.push("c");
    await Bun.sleep(80);
    expect(writes).toEqual(["abc"]);
    await log.close();
  });

  test("a failed write does not drop later writes or reject close", async () => {
    const writes: string[] = [];
    let calls = 0;
    const log = createLiveLog(async (text) => {
      if (calls++ === 0) throw new Error("boom");
      writes.push(text);
    });
    log.push("a");
    await Bun.sleep(80);
    log.push("b");
    await log.close();
    expect(writes).toEqual(["b"]);
  });
});

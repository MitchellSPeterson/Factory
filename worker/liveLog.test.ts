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
});

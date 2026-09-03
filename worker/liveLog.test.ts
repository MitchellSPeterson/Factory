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
});

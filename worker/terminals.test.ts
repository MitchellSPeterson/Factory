import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openShell } from "./terminals";

async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for shell");
    await Bun.sleep(20);
  }
}
test("PTY preserves cwd and environment, resizes, accepts interactive input, and exits", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "factory-terminal-"));
  const shell = openShell({ cwd, cols: 80, rows: 24, shell: "/bin/bash" });
  try {
    shell.write("export FACTORY_TERMINAL_TEST=retained; cd /tmp\n");
    shell.write('printf \'state:%s:%s\\n\' "$FACTORY_TERMINAL_TEST" "$PWD"\n');
    await until(() => shell.snapshot().output.includes("state:retained:/tmp"));
    shell.resize(100, 30);
    shell.write("stty size\n");
    await until(() => shell.snapshot().output.includes("30 100"));
    shell.write(
      "read -p 'answer: ' answer; printf 'received:%s\\n' \"$answer\"\n",
    );
    await until(() => shell.snapshot().output.includes("answer: "));
    shell.write("interactive\n");
    await until(() => shell.snapshot().output.includes("received:interactive"));
    shell.write("sleep 60\n");
    await Bun.sleep(100);
    shell.write("\u0003");
    shell.write("printf 'interrupt:%s\\n' ok\n");
    await until(() => shell.snapshot().output.includes("interrupt:ok"));
    shell.write("exit 7\n");
    await until(() => shell.snapshot().exit !== undefined);
    expect(shell.snapshot().exit).toBe("Shell exited with code 7.");
    expect(shell.snapshot().outputEnd).toBe(shell.snapshot().output.length);
  } finally {
    shell.close();
    await rm(cwd, { recursive: true, force: true });
  }
}, 15000);

test("terminal tabs have independent shell state", async () => {
  const first = openShell({
    cwd: "/tmp",
    cols: 80,
    rows: 24,
    shell: "/bin/bash",
  });
  const second = openShell({
    cwd: "/tmp",
    cols: 80,
    rows: 24,
    shell: "/bin/bash",
  });
  try {
    first.write("export FACTORY_TAB_VALUE=first\n");
    second.write("printf 'tab:%s\\n' \"${FACTORY_TAB_VALUE:-second}\"\n");
    await until(() => second.snapshot().output.includes("tab:second"));
    expect(first.snapshot().output).not.toContain("tab:second");
  } finally {
    first.close();
    second.close();
  }
});

test("closing a terminal stops its shell process", async () => {
  const shell = openShell({
    cwd: "/tmp",
    cols: 80,
    rows: 24,
    shell: "/bin/bash",
  });
  try {
    shell.write("printf 'shell-pid:%s\\n' \"$$\"\n");
    await until(() => /shell-pid:\d+/.test(shell.snapshot().output));
    const match = shell.snapshot().output.match(/shell-pid:(\d+)/);
    if (!match) throw new Error("Missing shell PID");
    const pid = Number(match[1]);
    shell.close();
    await until(() => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    });
    expect(shell.snapshot().exit).toBeDefined();
  } finally {
    shell.close();
  }
});

test("a missing Project directory reports its path instead of opening a shell", () => {
  expect(() =>
    openShell({
      cwd: "/tmp/factory-terminal-directory-that-does-not-exist",
      cols: 80,
      rows: 24,
      shell: "/bin/bash",
    }),
  ).toThrow("Project directory is unavailable");
});

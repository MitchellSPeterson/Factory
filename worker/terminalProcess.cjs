const pty = require("node-pty");
const readline = require("node:readline");
const [cwd, shell, cols, rows] = process.argv.slice(2);
const terminal = pty.spawn(shell, ["-l", "-i"], {
  cwd,
  cols: Number(cols),
  rows: Number(rows),
  name: "xterm-256color",
  env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
});
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
terminal.onData((data) => send({ type: "data", data }));
terminal.onExit(({ exitCode }) => {
  process.stdout.write(JSON.stringify({ type: "exit", exitCode }) + "\n", () =>
    process.exit(0),
  );
});
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const value = JSON.parse(line);
  if (value.type === "input" && typeof value.data === "string")
    terminal.write(value.data);
  if (
    value.type === "resize" &&
    Number.isInteger(value.cols) &&
    Number.isInteger(value.rows)
  )
    terminal.resize(value.cols, value.rows);
});
function stop() {
  terminal.kill();
  setTimeout(() => {
    try {
      terminal.kill("SIGKILL");
    } finally {
      process.exit(0);
    }
  }, 1000).unref();
}
process.stdin.on("end", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

export type TerminalDisplayProps = {
  output: string;
  outputEnd: number;
  enabled: boolean;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
};
export function receive(
  raw: string,
  props: TerminalDisplayProps,
  ready: () => void,
) {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return;
  }
  if (!value || typeof value !== "object" || !("type" in value)) return;
  if (value.type === "ready") ready();
  if (
    value.type === "input" &&
    "data" in value &&
    typeof value.data === "string"
  )
    props.onInput(value.data);
  if (
    value.type === "resize" &&
    "cols" in value &&
    "rows" in value &&
    typeof value.cols === "number" &&
    typeof value.rows === "number"
  ) {
    props.onResize(
      Math.min(500, Math.max(2, value.cols)),
      Math.min(200, Math.max(1, value.rows)),
    );
  }
}

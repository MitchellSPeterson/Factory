export function pairingBase(input: string) {
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed.replace(/\/$/, "");
  if (trimmed.includes(":")) return `http://${trimmed}`;
  return `http://${trimmed}:3402`;
}

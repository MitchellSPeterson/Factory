export function grokResumeId(agentId?: string): string | undefined {
  if (!agentId) return undefined;
  return agentId.startsWith("grok-") ? agentId.slice("grok-".length) : agentId;
}

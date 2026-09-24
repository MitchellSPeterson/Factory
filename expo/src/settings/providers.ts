import type { AgentProvider } from "../../../shared/agentModel";
import type { serverVariableNames } from "@/lib/workerSettings";

type VariableName = (typeof serverVariableNames)[number];

export type ProviderSetup = {
  /** How to sign in when the provider uses a local CLI login. */
  signIn: string;
  fields: Array<{ name: VariableName; label: string; secret: boolean; placeholder: string }>;
};

export const PROVIDER_SETUP: Record<AgentProvider, ProviderSetup> = {
  claude: {
    signIn: "Run `claude auth login` in Terminal on this Mac. Factory uses that login for chats, models, and usage.",
    fields: [
      { name: "ANTHROPIC_API_KEY", label: "API key", secret: true, placeholder: "Optional, instead of a Claude login" },
      { name: "CLAUDE_PATH", label: "CLI path", secret: false, placeholder: "~/.local/bin/claude" },
    ],
  },
  codex: {
    signIn: "Run `codex login` in Terminal on this Mac. Factory reads that ChatGPT login.",
    fields: [
      { name: "CODEX_API_KEY", label: "API key", secret: true, placeholder: "Optional, instead of a ChatGPT login" },
      { name: "CODEX_PATH", label: "CLI path", secret: false, placeholder: "codex" },
    ],
  },
  cursor: {
    signIn: "Create an API key in the Cursor dashboard under Integrations, then paste it here.",
    fields: [{ name: "CURSOR_API_KEY", label: "API key", secret: true, placeholder: "key_…" }],
  },
  grok: {
    signIn: "Run `grok login` in Terminal on this Mac.",
    fields: [
      { name: "XAI_API_KEY", label: "API key", secret: true, placeholder: "Optional, instead of a Grok login" },
      { name: "XAI_MANAGEMENT_KEY", label: "Management key", secret: true, placeholder: "Optional, for billing" },
      { name: "GROK_PATH", label: "CLI path", secret: false, placeholder: "grok" },
    ],
  },
  openai: {
    signIn: "Point Factory at any OpenAI-compatible endpoint. It lists models from /models.",
    fields: [
      { name: "OPENAI_BASE_URL", label: "Base URL", secret: false, placeholder: "https://api.openai.com/v1" },
      { name: "OPENAI_API_KEY", label: "API key", secret: true, placeholder: "sk-…" },
    ],
  },
};

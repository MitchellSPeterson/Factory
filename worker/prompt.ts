import type { StageKey } from "../convex/lib/jobState";

export type LaunchSkill = {
  slug: string;
  title: string;
  body: string;
};

export type ContextSegment = {
  key: string;
  label: string;
  tokens: number;
};

export type LaunchPrompt = {
  prompt: string;
  segments: ContextSegment[];
};

/** ponytail: ~4 chars/token; upgrade to a real tokenizer if we need billing-grade accuracy */
export function estimateTokens(text: string): number {
  if (text === "") return 0;
  return Math.ceil(text.length / 4);
}

export function buildLaunchPrompt(input: {
  stageKey: StageKey;
  request: string;
  projectName: string;
  projectKind: string;
  acceptedSpec?: string;
  skills: LaunchSkill[];
}): LaunchPrompt {
  const parts: Array<{ key: string; label: string; text: string }> = [
    {
      key: "instructions",
      label: "Instructions",
      text: `You are a Factory agent on project "${input.projectName}" (${input.projectKind}).
Stage: ${input.stageKey}.

Use the factory tools. Do not pretend you asked the human if you did not call ask_human.
Do not finish a stage without the artifacts that stage requires.

Job request:

`,
    },
    {
      key: "request",
      label: "Request",
      text: input.request,
    },
  ];

  if (input.acceptedSpec !== undefined) {
    parts.push({
      key: "spec",
      label: "Accepted spec",
      text: `\nAccepted spec:\n\n${input.acceptedSpec}\n`,
    });
  }

  input.skills.forEach((skill, index) => {
    const prefix = index === 0 ? "\n" : "\n\n---\n\n";
    parts.push({
      key: `skill:${skill.slug}`,
      label: `Skill · ${skill.title}`,
      text: `${prefix}## Skill: ${skill.title} (${skill.slug})\n\n${skill.body}`,
    });
  });

  parts.push({ key: "trailing", label: "Trailing newline", text: "\n" });

  const prompt = parts.map((part) => part.text).join("");
  const segments = parts
    .map((part) => ({
      key: part.key,
      label: part.label,
      tokens: estimateTokens(part.text),
    }))
    .filter((segment) => segment.tokens > 0 && segment.key !== "trailing");

  return { prompt, segments };
}

export function assemblePrompt(input: {
  stageKey: StageKey;
  request: string;
  projectName: string;
  projectKind: string;
  acceptedSpec?: string;
  skills: LaunchSkill[];
}): string {
  return buildLaunchPrompt(input).prompt;
}

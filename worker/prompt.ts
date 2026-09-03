import type { StageKey } from "../convex/lib/jobState";

export type LaunchSkill = {
  slug: string;
  title: string;
  body: string;
};

export function assemblePrompt(input: {
  stageKey: StageKey;
  request: string;
  projectName: string;
  projectKind: string;
  acceptedSpec?: string;
  skills: LaunchSkill[];
}): string {
  const skillBlock = input.skills
    .map((s) => `## Skill: ${s.title} (${s.slug})\n\n${s.body}`)
    .join("\n\n---\n\n");

  const spec =
    input.acceptedSpec !== undefined
      ? `\nAccepted spec:\n\n${input.acceptedSpec}\n`
      : "";

  return `You are a Factory agent on project "${input.projectName}" (${input.projectKind}).
Stage: ${input.stageKey}.

Use the factory tools. Do not pretend you asked the human if you did not call ask_human.
Do not finish a stage without the artifacts that stage requires.

Job request:

${input.request}
${spec}
${skillBlock}
`;
}

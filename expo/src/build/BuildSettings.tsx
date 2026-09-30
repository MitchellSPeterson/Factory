import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "panelui-native/components/button";
import { Input } from "panelui-native/components/input";
import { Textarea } from "panelui-native/components/textarea";
import { Text } from "panelui-native/primitives/text";
import { api } from "@/lib/api";
import { useMutation } from "@/lib/factory";
import type { Doc } from "@/lib/dataModel";
import { Notice } from "@/chats/ui";
import { useChatModels } from "@/chats/model-picker";
import { AgentPickField, type ChatModelOption } from "./AgentPickField";
import { DEFAULT_AGENT_EFFORT } from "../../../shared/agentModel";
import {
  WORKFLOW_ROLES,
  resolveBuildConfiguration,
  validateBuildConfiguration,
  type BuildConfiguration,
  type WorkflowRole,
} from "../../../shared/buildWorkflow";

export const ROLE_LABEL: Record<WorkflowRole, string> = {
  prototype: "Prototype",
  planner: "Planner",
  builder: "Builder",
  verifier: "Verifier",
  reviewer: "Code reviewer",
};
export function initialBuildConfiguration(
  models: ChatModelOption[],
  base?: BuildConfiguration,
) {
  if (base) return structuredClone(base);
  const first = models[0];
  if (!first) return null;
  const second =
    models.find((model) => model.provider !== first.provider) ??
    models[1] ??
    first;
  return resolveBuildConfiguration(
    {
      provider: first.provider,
      model: first.model,
      effort: DEFAULT_AGENT_EFFORT,
    },
    {
      provider: second.provider,
      model: second.model,
      effort: DEFAULT_AGENT_EFFORT,
    },
  );
}

export function BuildConfigurationForm({
  config,
  onChange,
  models,
  skills,
}: {
  config: BuildConfiguration;
  onChange: (config: BuildConfiguration) => void;
  models: ChatModelOption[];
  skills: Array<{ slug: string; title: string }>;
}) {
  const [expanded, setExpanded] = useState<WorkflowRole | null>(null);
  const patch = (change: Partial<BuildConfiguration>) =>
    onChange({ ...config, ...change });
  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="text-sm font-semibold text-foreground">Roles</Text>
        {WORKFLOW_ROLES.map((role) => (
          <View
            key={role}
            className="gap-2 rounded-xl border border-border p-3"
          >
            <AgentPickField
              label={ROLE_LABEL[role]}
              value={config.roles[role]}
              models={models}
              onChange={(pick) =>
                patch({
                  roles: {
                    ...config.roles,
                    [role]: { ...config.roles[role], ...pick },
                  },
                })
              }
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: expanded === role }}
              onPress={() => setExpanded(expanded === role ? null : role)}
            >
              <Text className="text-xs text-primary">
                {config.roles[role].skills.length
                  ? `${config.roles[role].skills.length} Skills selected`
                  : "Choose Skills"}
              </Text>
            </Pressable>
            {expanded === role && (
              <View className="gap-1">
                {skills.length === 0 && (
                  <Text className="text-xs text-muted-foreground">
                    The Worker has not reported any Skills for this Project.
                  </Text>
                )}
                {skills.map((skill) => {
                  const selected = config.roles[role].skills.includes(
                    skill.slug,
                  );
                  return (
                    <Pressable
                      key={skill.slug}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() =>
                        patch({
                          roles: {
                            ...config.roles,
                            [role]: {
                              ...config.roles[role],
                              skills: selected
                                ? config.roles[role].skills.filter(
                                    (slug) => slug !== skill.slug,
                                  )
                                : [...config.roles[role].skills, skill.slug],
                            },
                          },
                        })
                      }
                      className="flex-row items-center gap-2 py-1.5"
                    >
                      <View
                        className={`h-4 w-4 rounded border ${selected ? "border-primary bg-primary" : "border-border"}`}
                      />
                      <Text className="flex-1 text-xs text-foreground">
                        {skill.title}
                      </Text>
                    </Pressable>
                  );
                })}
                {config.roles[role].skills
                  .filter(
                    (slug) => !skills.some((skill) => skill.slug === slug),
                  )
                  .map((slug) => (
                    <Pressable
                      key={slug}
                      onPress={() =>
                        patch({
                          roles: {
                            ...config.roles,
                            [role]: {
                              ...config.roles[role],
                              skills: config.roles[role].skills.filter(
                                (value) => value !== slug,
                              ),
                            },
                          },
                        })
                      }
                    >
                      <Text className="text-xs text-destructive">
                        Unavailable: {slug} · Remove
                      </Text>
                    </Pressable>
                  ))}
              </View>
            )}
            <Input
              label="Role timeout (minutes)"
              keyboardType="numeric"
              value={String(config.roleTimeoutMs[role] / 60000)}
              onChangeText={(text) =>
                patch({
                  roleTimeoutMs: {
                    ...config.roleTimeoutMs,
                    [role]: Number(text) * 60000,
                  },
                })
              }
            />
          </View>
        ))}
      </View>
      <Text className="text-sm font-semibold text-foreground">
        Project setup
      </Text>
      <Input
        label="Setup command"
        value={config.setupCommand}
        onChangeText={(setupCommand) => patch({ setupCommand })}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Discovered by the setup agent"
      />
      <Textarea
        label="Required check commands · one per line"
        value={config.checkCommands.join("\n")}
        onChangeText={(text) => patch({ checkCommands: text.split("\n") })}
        placeholder="bun run check"
      />
      <Input
        label="Preview command"
        value={config.previewCommand}
        onChangeText={(previewCommand) => patch({ previewCommand })}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="bun run dev"
      />
      <Textarea
        label="Verification targets · one per line"
        value={config.verificationTargets.join("\n")}
        onChangeText={(text) =>
          patch({ verificationTargets: text.split("\n") })
        }
        placeholder="Web · iOS Simulator"
      />
      <Text className="text-sm font-semibold text-foreground">
        Build limits
      </Text>
      <Input
        label="Lifetime runtime ceiling (minutes)"
        keyboardType="numeric"
        value={String(config.runtimeCeilingMs / 60000)}
        onChangeText={(text) =>
          patch({ runtimeCeilingMs: Number(text) * 60000 })
        }
      />
      <Input
        label="Token ceiling (optional)"
        keyboardType="numeric"
        value={
          config.tokenCeiling === undefined ? "" : String(config.tokenCeiling)
        }
        onChangeText={(text) =>
          patch({ tokenCeiling: text.trim() ? Number(text) : undefined })
        }
      />

      <Text className="text-xs leading-5 text-muted-foreground">
        Each Batch permits three builder attempts. Continue renews attempts; it
        keeps lifetime resource limits. This Worker supports time and token
        bounds; monetary caps are unavailable.
      </Text>
    </View>
  );
}

export function cleanBuildConfiguration(config: BuildConfiguration) {
  const { costCeilingCents: _unsupportedCostCeiling, ...supportedConfig } =
    config;
  const result = {
    ...supportedConfig,
    checkCommands: config.checkCommands
      .map((command) => command.trim())
      .filter(Boolean),
    verificationTargets: config.verificationTargets
      .map((target) => target.trim())
      .filter(Boolean),
  };
  validateBuildConfiguration(result);
  return result;
}

export function BuildSettings({ project }: { project: Doc<"projects"> }) {
  const models = useChatModels();
  const save = useMutation(api.projects.configureBuild);
  const [config, setConfig] = useState<BuildConfiguration | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const loaded = useRef<{ project: string; signature: string } | null>(null);
  const dirty = useRef(false);
  const persistedSignature = JSON.stringify(project.buildConfig ?? null);
  const modelSignature = JSON.stringify(models ?? []);
  useEffect(() => {
    const newProject = loaded.current?.project !== project._id;
    const changed = loaded.current?.signature !== persistedSignature;
    if (newProject) dirty.current = false;
    if ((newProject || changed || !config) && !dirty.current)
      setConfig(initialBuildConfiguration(models ?? [], project.buildConfig));
    loaded.current = { project: project._id, signature: persistedSignature };
  }, [project._id, persistedSignature, modelSignature]);
  async function submit(discover: boolean) {
    if (!config || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await save({
        projectId: project._id,
        config: cleanBuildConfiguration({
          ...config,
          discovered: discover ? false : config.discovered,
        }),
      });
      dirty.current = false;
      setSaved(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save Build settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View className="gap-3 rounded-xl border border-border bg-surface p-4">
      <Text className="text-base font-semibold text-foreground">
        Build settings
      </Text>
      <Text className="text-xs leading-5 text-muted-foreground">
        Reusable settings for new Builds. The setup agent discovers commands
        before the first Build; active Builds keep their saved settings and
        Skills.
      </Text>
      {config ? (
        <BuildConfigurationForm
          config={config}
          onChange={(next) => {
            dirty.current = true;
            setConfig(next);
            setSaved(false);
          }}
          models={models ?? []}
          skills={project.skills ?? []}
        />
      ) : (
        <Text className="text-sm text-muted-foreground">
          Loading available models from the Worker…
        </Text>
      )}
      {!!error && <Notice text={error} error />}
      {saved && (
        <Text className="text-xs text-success">Build settings saved.</Text>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Button disabled={!config || busy} onPress={() => void submit(false)}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
        <Button
          variant="ghost"
          disabled={!config || busy}
          onPress={() => void submit(true)}
        >
          Discover setup on next Build
        </Button>
      </View>
    </View>
  );
}

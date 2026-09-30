import { Children, useEffect, useRef, useState, type ReactNode } from "react";
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
import { SettingsGroup, SettingsMessage } from "@/settings/ui";
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

/** Settings-page card in `grouped` mode; the plain bordered layout in dialogs. */
function Section({
  grouped,
  title,
  footer,
  children,
}: {
  grouped?: boolean;
  title: string;
  footer?: string;
  children: ReactNode;
}) {
  if (grouped)
    return (
      <SettingsGroup title={title} footer={footer}>
        {Children.toArray(children).map((child, i) => (
          <View key={i} className="gap-2 px-4 py-3">
            {child}
          </View>
        ))}
      </SettingsGroup>
    );
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      {children}
      {footer ? (
        <Text className="text-xs leading-5 text-muted-foreground">{footer}</Text>
      ) : null}
    </View>
  );
}

export function BuildConfigurationForm({
  config,
  onChange,
  models,
  skills,
  grouped,
}: {
  config: BuildConfiguration;
  onChange: (config: BuildConfiguration) => void;
  models: ChatModelOption[];
  skills: Array<{ slug: string; title: string }>;
  grouped?: boolean;
}) {
  const [expanded, setExpanded] = useState<WorkflowRole | null>(null);
  const patch = (change: Partial<BuildConfiguration>) =>
    onChange({ ...config, ...change });
  const setRole = (role: WorkflowRole, change: Partial<BuildConfiguration["roles"][WorkflowRole]>) =>
    patch({
      roles: { ...config.roles, [role]: { ...config.roles[role], ...change } },
    });
  const roleSections = WORKFLOW_ROLES.map((role) => {
    const current = config.roles[role];
    const rows = [
      <AgentPickField
        key="pick"
        label="Model"
        value={current}
        models={models}
        onChange={(pick) => setRole(role, pick)}
      />,
      <View key="skills" className="gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: expanded === role }}
          onPress={() => setExpanded(expanded === role ? null : role)}
        >
          <Text className="text-sm text-primary">
            {current.skills.length
              ? `${current.skills.length} Skills selected`
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
              const selected = current.skills.includes(skill.slug);
              return (
                <Pressable
                  key={skill.slug}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() =>
                    setRole(role, {
                      skills: selected
                        ? current.skills.filter((slug) => slug !== skill.slug)
                        : [...current.skills, skill.slug],
                    })
                  }
                  className="flex-row items-center gap-2 py-1.5"
                >
                  <View
                    className={`h-4 w-4 rounded border ${selected ? "border-primary bg-primary" : "border-border"}`}
                  />
                  <Text className="flex-1 text-sm text-foreground">
                    {skill.title}
                  </Text>
                </Pressable>
              );
            })}
            {current.skills
              .filter((slug) => !skills.some((skill) => skill.slug === slug))
              .map((slug) => (
                <Pressable
                  key={slug}
                  onPress={() =>
                    setRole(role, {
                      skills: current.skills.filter((value) => value !== slug),
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
      </View>,
      <Textarea
        key="prompt"
        label="Additional prompt (optional)"
        value={current.prompt ?? ""}
        onChangeText={(prompt) => setRole(role, { prompt })}
        placeholder="Extra instructions appended to this role's prompt"
      />,
      <Input
        key="timeout"
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
      />,
    ];
    return grouped ? (
      <Section key={role} grouped title={ROLE_LABEL[role]}>
        {rows}
      </Section>
    ) : (
      <View key={role} className="gap-2 rounded-xl border border-border p-3">
        <Text className="text-sm font-medium text-foreground">
          {ROLE_LABEL[role]}
        </Text>
        {rows}
      </View>
    );
  });
  return (
    <View className={grouped ? "gap-6" : "gap-4"}>
      {grouped ? (
        roleSections
      ) : (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Roles</Text>
          {roleSections}
        </View>
      )}
      <Section grouped={grouped} title="Project setup">
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
      </Section>
      <Section
        grouped={grouped}
        title="Build limits"
        footer="Each Batch permits three builder attempts. Continue renews attempts; it keeps lifetime resource limits. This Worker supports time and token bounds; monetary caps are unavailable."
      >
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
      </Section>
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
    <View className="gap-6">
      <View className="gap-1 px-1">
        <Text className="text-base font-semibold text-foreground">
          Build settings
        </Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          Reusable settings for new Builds. The setup agent discovers commands
          before the first Build; active Builds keep their saved settings and
          Skills.
        </Text>
      </View>
      {config ? (
        <BuildConfigurationForm
          grouped
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
        <SettingsGroup>
          <SettingsMessage>
            Loading available models from the Worker…
          </SettingsMessage>
        </SettingsGroup>
      )}
      {!!error && <Notice text={error} error />}
      {saved && (
        <Text className="px-1 text-xs text-success">Build settings saved.</Text>
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

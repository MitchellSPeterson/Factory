import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "panelui-native/components/button";
import { Dialog } from "panelui-native/components/dialog";
import { Text } from "panelui-native/primitives/text";
import { useMutation, useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { Notice } from "@/chats/ui";
import { useChatModels } from "@/chats/model-picker";
import {
  BuildConfigurationForm,
  cleanBuildConfiguration,
  initialBuildConfiguration,
} from "./BuildSettings";
import type {
  BuildConfiguration,
  PrototypeMode,
} from "../../../shared/buildWorkflow";

export function SendToBuildDialog({
  visible,
  roadmapItemId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  roadmapItemId: Id<"roadmapItems">;
  onClose: () => void;
  onCreated: (id: Id<"builds">) => void;
}) {
  const models = useChatModels();
  const item = useQuery(
    api.roadmap.getItem,
    visible ? { itemId: roadmapItemId } : "skip",
  );
  const project = useQuery(
    api.projects.get,
    item ? { projectId: item.projectId } : "skip",
  );
  const create = useMutation(api.builds.create);
  const [config, setConfig] = useState<BuildConfiguration | null>(null);
  const [overrides, setOverrides] = useState(false);
  const [prototypeMode, setPrototypeMode] = useState<PrototypeMode>("auto");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) {
      setError("");
      setOverrides(false);
      setPrototypeMode("auto");
      setConfig(null);
    }
  }, [visible, roadmapItemId]);
  useEffect(() => {
    if (visible && !config && project)
      setConfig(initialBuildConfiguration(models ?? [], project.buildConfig));
  }, [visible, config, project, models]);
  async function submit() {
    if (!config || busy) return;
    setBusy(true);
    setError("");
    try {
      const resolved = cleanBuildConfiguration(config);
      const id = await create({
        roadmapItemId,
        checkCommand: "",
        agent: resolved.roles.builder,
        reviewer: resolved.roles.reviewer,
        prototypeMode,
        ...(overrides ? { config: resolved } : {}),
      });
      onCreated(id);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not start that Build.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Content className="max-h-[90%] w-full max-w-[560px]">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-3.5"
        >
          <Dialog.Title>Send to Build</Dialog.Title>
          <Dialog.Description>
            Factory refines Requirements, prepares a Prototype when needed,
            plans automatically, and checks the complete change before PR
            review.
          </Dialog.Description>
          <View className="gap-2">
            <Text className="text-xs font-semibold text-muted-foreground">
              Prototype
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {(
                [
                  ["auto", "Automatic"],
                  ["required", "Require"],
                  ["skip", "Skip"],
                ] as const
              ).map(([mode, label]) => (
                <Button
                  key={mode}
                  variant={prototypeMode === mode ? "primary" : "ghost"}
                  onPress={() => setPrototypeMode(mode)}
                >
                  {label}
                </Button>
              ))}
            </View>
            <Text className="text-xs leading-5 text-muted-foreground">
              New components and substantial UI redesigns require design
              approval. Each implementation Batch allows three builder attempts.
            </Text>
          </View>
          <View className="rounded-xl border border-border p-3">
            <Text className="text-sm text-foreground">
              {project?.buildConfig?.discovered
                ? "Using this Project’s saved Build settings"
                : "The setup agent will discover this Project’s commands"}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-muted-foreground">
              Role settings and selected Skills are preserved when this Build
              starts.
            </Text>
            <Button
              className="mt-2 self-start"
              variant="ghost"
              onPress={() => setOverrides(!overrides)}
            >
              {overrides ? "Hide overrides" : "Override for this Build"}
            </Button>
          </View>
          {overrides && config && (
            <BuildConfigurationForm
              config={config}
              onChange={setConfig}
              models={models ?? []}
              skills={project?.skills ?? []}
            />
          )}
          {!config && (
            <Text className="text-sm text-muted-foreground">
              Loading Project settings and models from the Worker…
            </Text>
          )}
          {!!error && <Notice text={error} error />}
        </ScrollView>
        <Dialog.Footer>
          <Button variant="ghost" onPress={onClose}>
            Cancel
          </Button>
          <Button disabled={!config || busy} onPress={() => void submit()}>
            {busy ? "Starting…" : "Start Build"}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

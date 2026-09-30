import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { Button } from "panelui-native/components/button";
import { Spinner } from "panelui-native/components/spinner";
import { Text } from "panelui-native/primitives/text";
import { Notice } from "@/chats/ui";
import { Popover } from "@/roadmap/Popover";
import { ArtifactPreview } from "../ArtifactPreview";
import { useBuildArtifact } from "../artifacts";
import type { WorkflowArtifact } from "../../../../shared/buildWorkflow";
import { Panel } from "./shared";

export function EvidenceView({
  buildId,
  artifacts,
  currentRevision,
}: {
  buildId: string;
  artifacts: WorkflowArtifact[];
  currentRevision?: string;
}) {
  const [selected, setSelected] = useState<string | undefined>();
  const chosen =
    artifacts.find((item) => item.id === selected) ??
    artifacts.find((item) => item.kind === "visualExplanation") ??
    artifacts[0]!;
  const loaded = useBuildArtifact(buildId, chosen.id, chosen.mime);
  return (
    <Panel title="Evidence">
      <Popover
        align="left"
        items={artifacts.map((item) => ({
          label: `${item.title} · Batch ${item.batch}`,
          selected: item.id === chosen.id,
          onPress: () => setSelected(item.id),
        }))}
      >
        {(open) => (
          <Button variant="ghost" className="self-start" onPress={open}>
            {chosen.title} ▾
          </Button>
        )}
      </Popover>
      <Text className="text-xs text-muted-foreground">
        Batch {chosen.batch} · Candidate {chosen.revision}
        {chosen.requirementId ? ` · Requirement ${chosen.requirementId}` : ""}
        {chosen.prototypeRevision
          ? ` · Prototype ${chosen.prototypeRevision}`
          : ""}
        {currentRevision && chosen.revision !== currentRevision
          ? " · Earlier evidence"
          : ""}
      </Text>
      {loaded.error ? (
        <View className="gap-2">
          <Notice text={loaded.error} error />
          <Button
            className="self-start"
            variant="ghost"
            onPress={loaded.reload}
          >
            Retry artifact
          </Button>
        </View>
      ) : loaded.content === undefined ? (
        <Spinner label="Loading evidence" />
      ) : loaded.mime?.startsWith("image/") ? (
        <Image
          source={{ uri: loaded.content }}
          accessibilityLabel={chosen.title}
          resizeMode="contain"
          style={{ width: "100%", height: 420 }}
        />
      ) : loaded.mime?.includes("html") ? (
        <ArtifactPreview html={loaded.content} title={chosen.title} />
      ) : (
        <ScrollView className="max-h-[400px] rounded-xl border border-border p-3">
          <Text
            selectable
            className="text-xs font-mono leading-5 text-muted-foreground"
          >
            {loaded.content || "No output"}
          </Text>
        </ScrollView>
      )}
    </Panel>
  );
}

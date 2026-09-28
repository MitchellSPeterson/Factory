import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Item } from "panelui-native/components/item";
import { Spinner } from "panelui-native/components/spinner";
import { ChevronRightIcon } from "panelui-native/icons";
import { useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Doc, Id } from "@/lib/dataModel";
import { Action } from "@/chats/ui";
import { EmptyState } from "@/components/empty-state";
import { BUILD_STATUS_LABEL } from "@/build/meta";
import type { BuildStatus } from "../../../shared/helix";

function statusDot(status: BuildStatus) {
  if (status === "done") return "bg-success";
  if (status === "paused") return "bg-destructive";
  if (status === "stopped") return "bg-muted-foreground";
  return "bg-primary";
}

export function BuildList({
  projectId,
  selectedId,
  onOpen,
}: {
  projectId: Id<"projects">;
  selectedId: Id<"builds"> | undefined;
  onOpen: (id: Id<"builds">) => void;
}) {
  const router = useRouter();
  const builds = useQuery(api.builds.list, { projectId });
  const sorted = [...(builds ?? [])].sort((a, b) => b._creationTime - a._creationTime);

  return (
    <View className="min-h-0 flex-1">
      {builds === undefined ? (
        <View className="flex-1 items-center justify-center">
          <Spinner label="Loading Builds" />
        </View>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="loop"
          title="No Builds yet"
          body="Start one from a Roadmap Item: open the item and choose “Send to Build”."
          action={<Action label="Open Roadmap" emphasis onPress={() => router.push("/roadmap")} />}
        />
      ) : (
        <ScrollView contentContainerClassName="gap-0.5 p-1.5 pb-10">
          {sorted.map((build) => (
            <BuildRow key={build._id} build={build} selected={selectedId === build._id} onOpen={() => onOpen(build._id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function BuildRow({ build, selected, onOpen }: { build: Doc<"builds">; selected: boolean; onOpen: () => void }) {
  const done = build.checkpoints.filter((c) => c.status === "done").length;
  const total = build.checkpoints.length;
  const meta = `${BUILD_STATUS_LABEL[build.status]}${total > 0 ? ` · ${done}/${total} Checkpoints` : ""}`;
  return (
    <Item
      onPress={onOpen}
      accessibilityLabel={`${build.title}, ${meta}${selected ? ", selected" : ""}`}
      className={selected ? "bg-primary/15" : "bg-transparent"}>
      <Item.Media>
        <View className={`h-2 w-2 rounded-full ${statusDot(build.status)}`} />
      </Item.Media>
      <Item.Content>
        <Item.Title numberOfLines={1}>{build.title}</Item.Title>
        <Item.Description className="tabular-nums">{meta}</Item.Description>
      </Item.Content>
      <Item.Actions>
        <ChevronRightIcon size={14} />
      </Item.Actions>
    </Item>
  );
}

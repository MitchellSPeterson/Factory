import { useState } from "react";
import { View } from "react-native";
import { Button } from "panelui-native/components/button";
import { Spinner } from "panelui-native/components/spinner";
import { Textarea } from "panelui-native/components/textarea";
import { Text } from "panelui-native/primitives/text";
import { Notice } from "@/chats/ui";
import { Popover } from "@/roadmap/Popover";
import { ArtifactPreview } from "../ArtifactPreview";
import { useBuildArtifact, type PreviewAnchor } from "../artifacts";
import type { WorkflowState } from "../../../../shared/buildWorkflow";
import { Panel, identity, type UserAction } from "./shared";

export function PrototypeReview({
  buildId,
  workflow,
  busy,
  fire,
}: {
  buildId: string;
  workflow: WorkflowState;
  busy: boolean;
  fire: (action: UserAction) => Promise<boolean>;
}) {
  const [viewedRevision, setViewedRevision] = useState<string | undefined>();
  const latest = workflow.prototypeRevisions.at(-1)!;
  const revision =
    workflow.prototypeRevisions.find((item) => item.id === viewedRevision) ??
    latest;
  const artifact = useBuildArtifact(buildId, revision.artifactId);
  const [pinning, setPinning] = useState(false);
  const [anchor, setAnchor] = useState<PreviewAnchor | undefined>();
  const [text, setText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [selectedComment, setSelectedComment] = useState<string>();
  const comments = workflow.comments.filter(
    (comment) => comment.revision === revision.id,
  );
  const allowed =
    workflow.phase === "prototypeReview" &&
    workflow.status === "waiting" &&
    revision.id === latest.id;
  return (
    <Panel title="Prototype review">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Popover
          align="left"
          items={workflow.prototypeRevisions.map((item, index) => ({
            label: `Revision ${index + 1}${item.id === workflow.approvedPrototypeRevision ? " · Approved" : ""}`,
            selected: item.id === revision.id,
            onPress: () => {
              setViewedRevision(item.id);
              setAnchor(undefined);
              setText("");
              setInstruction("");
              setSelectedComment(undefined);
              setPinning(false);
            },
          }))}
        >
          {(open) => (
            <Button variant="ghost" onPress={open}>
              Revision {workflow.prototypeRevisions.indexOf(revision) + 1} ▾
              {revision.id === workflow.approvedPrototypeRevision
                ? " · Approved"
                : ""}
            </Button>
          )}
        </Popover>
        <Button
          variant="ghost"
          disabled={!artifact.content}
          onPress={() => {
            setPinning(!pinning);
            setAnchor(undefined);
          }}
        >
          {pinning ? "Interact with Prototype" : "Pin a comment"}
        </Button>
      </View>
      {artifact.error ? (
        <View className="gap-2">
          <Notice text={artifact.error} error />
          <Button
            className="self-start"
            variant="ghost"
            onPress={artifact.reload}
          >
            Retry artifact
          </Button>
        </View>
      ) : artifact.content ? (
        <ArtifactPreview
          key={revision.id}
          html={artifact.content}
          title={`Prototype revision ${workflow.prototypeRevisions.indexOf(revision) + 1}`}
          pinning={pinning}
          onPin={(point) => {
            setViewedRevision(revision.id);
            setAnchor(point);
            setPinning(false);
          }}
          pins={comments
            .filter(
              (comment) => comment.pin && (!comment.resolved || showResolved),
            )
            .map((comment) => ({
              id: comment.id,
              label: comment.text,
              resolved: comment.resolved,
              anchor: {
                ...comment.pin!,
                viewportWidth: comment.pin!.viewportWidth ?? 0,
                viewportHeight: comment.pin!.viewportHeight ?? 0,
              },
            }))}
          onSelectPin={(id) => {
            setSelectedComment(id);
            setShowResolved(true);
          }}
        />
      ) : (
        <View className="h-[200px] items-center justify-center">
          <Spinner label="Loading Prototype" />
        </View>
      )}
      <Text className="text-xs leading-5 text-muted-foreground">
        {pinning
          ? "Tap a location to attach a comment. Switch back to interact with the Prototype."
          : "Interact with this preserved Prototype. Comments are collected until you request a revision."}
      </Text>
      {selectedComment &&
        comments.some((comment) => comment.id === selectedComment) && (
          <View className="gap-1 rounded-xl border border-primary bg-primary/5 p-3">
            <Text className="text-xs font-semibold text-primary">
              Selected pinned comment
            </Text>
            <Text className="text-sm leading-5 text-foreground">
              {comments.find((comment) => comment.id === selectedComment)!.text}
            </Text>
            <Button
              variant="ghost"
              className="self-start"
              onPress={() => setSelectedComment(undefined)}
            >
              Dismiss selection
            </Button>
          </View>
        )}
      {!!revision.instruction && (
        <Text className="text-xs leading-5 text-muted-foreground">
          Revision instructions: {revision.instruction}
        </Text>
      )}
      <View className="gap-2 rounded-xl border border-border p-3">
        <Text className="text-sm font-semibold text-foreground">
          Anything you want to change?
        </Text>
        <Textarea
          accessibilityLabel={`Comment on Prototype revision ${workflow.prototypeRevisions.indexOf(revision) + 1}`}
          value={text}
          onChangeText={(value) => {
            setViewedRevision(revision.id);
            setText(value);
          }}
          placeholder={
            anchor
              ? "Comment on this location…"
              : "General comment on this revision…"
          }
        />
        {anchor && (
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-xs text-muted-foreground">
              Pinned at {Math.round(anchor.x * 100)}%,{" "}
              {Math.round(anchor.y * 100)}% · {Math.round(anchor.viewportWidth)}{" "}
              × {Math.round(anchor.viewportHeight)}
            </Text>
            <Button variant="ghost" onPress={() => setAnchor(undefined)}>
              Remove pin
            </Button>
          </View>
        )}
        <Button
          className="self-start"
          variant="ghost"
          disabled={busy || !text.trim() || workflow.status === "stopped"}
          onPress={async () => {
            const submittedRevision = revision.id;
            if (
              await fire({
                kind: "comment",
                comment: {
                  id: identity(),
                  revision: submittedRevision,
                  text: text.trim(),
                  resolved: false,
                  pin: anchor,
                  createdAt: Date.now(),
                },
              })
            ) {
              setText("");
              setAnchor(undefined);
            }
          }}
        >
          Add comment
        </Button>
      </View>
      {comments.length > 0 && (
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-xs text-muted-foreground">
              {comments.filter((comment) => !comment.resolved).length}{" "}
              unresolved ·{" "}
              {comments.filter((comment) => comment.resolved).length} resolved
            </Text>
            <Button
              variant="ghost"
              onPress={() => setShowResolved(!showResolved)}
            >
              {showResolved ? "Hide resolved" : "Show resolved"}
            </Button>
          </View>
          {comments
            .filter((comment) => !comment.resolved || showResolved)
            .map((comment) => (
              <View
                key={comment.id}
                className={`gap-1 rounded-xl border p-3 ${selectedComment === comment.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <Text className="text-xs text-muted-foreground">
                  {comment.pin
                    ? `Pinned · ${Math.round(comment.pin.x * 100)}%, ${Math.round(comment.pin.y * 100)}%`
                    : "General comment"}
                  {comment.resolved ? " · Resolved" : ""}
                </Text>
                <Text className="text-sm leading-5 text-foreground">
                  {comment.text}
                </Text>
                <Button
                  className="self-start"
                  variant="ghost"
                  disabled={
                    busy ||
                    workflow.status === "stopped" ||
                    workflow.status === "done"
                  }
                  onPress={() =>
                    void fire({
                      kind: "resolveComment",
                      commentId: comment.id,
                      resolved: !comment.resolved,
                    })
                  }
                >
                  {comment.resolved ? "Reopen" : "Resolve"}
                </Button>
              </View>
            ))}
        </View>
      )}
      {allowed ? (
        <View className="gap-2 rounded-xl border border-border p-3">
          <Textarea
            value={instruction}
            onChangeText={setInstruction}
            placeholder="Additional revision instructions (optional)…"
          />
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="ghost"
              disabled={
                busy ||
                !!text.trim() ||
                (!instruction.trim() &&
                  !comments.some((comment) => !comment.resolved))
              }
              onPress={async () => {
                if (
                  await fire({
                    kind: "requestRevision",
                    revision: revision.id,
                    text:
                      instruction.trim() ||
                      "Address the unresolved comments on this revision.",
                  })
                ) {
                  setInstruction("");
                  setViewedRevision(undefined);
                }
              }}
            >
              Request revision
            </Button>
            <Button
              disabled={busy || !!text.trim() || workflow.status !== "waiting"}
              onPress={() =>
                void fire({ kind: "approvePrototype", revision: revision.id })
              }
            >
              Approve revision{" "}
              {workflow.prototypeRevisions.indexOf(revision) + 1}
            </Button>
          </View>
          {!!text.trim() && (
            <Text className="text-xs text-muted-foreground">
              Add your draft comment before requesting a revision or approving.
            </Text>
          )}
          <Text className="text-xs leading-5 text-muted-foreground">
            Request revision starts one agent update. Approval applies to this
            exact revision and starts automatic planning.
          </Text>
        </View>
      ) : (
        <Text className="text-xs text-muted-foreground">
          {revision.id !== latest.id
            ? "You are viewing a preserved revision. Select the latest revision to approve or request changes."
            : revision.id === workflow.approvedPrototypeRevision
              ? "This revision is approved and guides implementation and UI verification."
              : "The next review will be available after the agent finishes."}
        </Text>
      )}
    </Panel>
  );
}

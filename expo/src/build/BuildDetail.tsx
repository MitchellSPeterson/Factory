// One Build: the loop visual for the active Checkpoint, the Checkpoint timeline below it, and
// a sticky action card when it's the engineer's turn. Mirrors roadmap/ItemDetail.tsx's shell.
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, type LayoutRectangle } from "react-native";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import Animated, { FadeIn, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { useCSSVariable } from "uniwind";
import { Badge } from "panelui-native/components/badge";
import { Button } from "panelui-native/components/button";
import { Chip } from "panelui-native/components/chip";
import { Dialog } from "panelui-native/components/dialog";
import { Input } from "panelui-native/components/input";
import { Spinner } from "panelui-native/components/spinner";
import { Textarea } from "panelui-native/components/textarea";
import { XIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";
import { useMutation, useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { Action, Notice } from "@/chats/ui";
import { IconButton, IconNames, type IconName } from "@/components/icon-button";
import { Popover } from "@/roadmap/Popover";
import { DragRow } from "@/roadmap/DragRow";
import { dropTarget, type DropSection } from "@/roadmap/reorder";
import { EASE_OUT, MOTION_MS } from "@/roadmap/meta";
import { LoopVisual } from "@/build/LoopVisual";
import { BUILD_STATUS_LABEL, GATE_LABEL, GATE_STATE_LABEL, LOOP_NODES } from "@/build/meta";
import { GATES, type BuildEvent, type Checkpoint, type GateKey, type PlannedCheckpoint, type Step } from "../../../shared/helix";

const LAYOUT = LinearTransition.duration(MOTION_MS).easing(EASE_OUT);

function statusDot(status: string) {
  if (status === "done") return "bg-success";
  if (status === "paused") return "bg-destructive";
  if (status === "stopped") return "bg-muted-foreground";
  return "bg-primary";
}

function useInk() {
  const [success, danger, primary, muted] = useCSSVariable([
    "--color-success",
    "--color-destructive",
    "--color-primary",
    "--color-muted-foreground",
  ]) as (string | undefined)[];
  return (state: string) => {
    if (state === "pass" || state === "done") return success;
    if (state === "fail" || state === "paused") return danger;
    if (state === "running") return primary;
    return muted;
  };
}

function activeGateKey(step: Step): GateKey | null {
  if (step.kind === "check") return "behavior";
  if (step.kind === "uiReview") return "ui";
  if (step.kind === "review") return "review";
  return null;
}

function moveCheckpointDraft<T extends { id: string }>(list: T[], id: string, beforeId: string | null): T[] {
  const moving = list.find((c) => c.id === id);
  if (!moving) return list;
  const rest = list.filter((c) => c.id !== id);
  const at = beforeId === null ? rest.length : rest.findIndex((c) => c.id === beforeId);
  const index = at === -1 ? rest.length : at;
  return [...rest.slice(0, index), moving, ...rest.slice(index)];
}

function measure(view: View | null | undefined) {
  return new Promise<LayoutRectangle | null>((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

export function BuildDetail({ buildId, onClose }: { buildId: Id<"builds">; onClose: () => void }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const build = useQuery(api.builds.get, { buildId });
  const send = useMutation(api.builds.send);
  const [error, setError] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);

  async function fire(event: BuildEvent) {
    setError("");
    try {
      await send({ buildId, event });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the Worker.");
    }
  }

  function openSession(id: Id<"sessions">) {
    router.push({ pathname: "/chats", params: { session: id } });
  }

  if (build === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner label="Loading Build" />
      </View>
    );
  }
  if (build === null) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-sm text-muted-foreground">This Build was removed.</Text>
      </View>
    );
  }

  const cp = build.checkpoints[build.current];
  const stoppable = build.status !== "done" && build.status !== "stopped";

  return (
    <ScrollView className="flex-1" contentContainerClassName="w-full max-w-[760px] self-center px-5 pb-6 pt-3" keyboardShouldPersistTaps="handled">
      <View className="-mr-2 flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 gap-1">
          <Text numberOfLines={2} className="text-[22px] font-bold leading-7 tracking-tight text-foreground">
            {build.title}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <View className={`h-1.5 w-1.5 rounded-full ${statusDot(build.status)}`} />
            <Text className="text-[13px] text-muted-foreground">{BUILD_STATUS_LABEL[build.status]}</Text>
            {build.checkpoints.length > 0 ? (
              <Text className="text-[13px] text-muted-foreground">
                {" · Checkpoint "}
                {build.current + 1} of {build.checkpoints.length}
              </Text>
            ) : null}
            {cp && cp.attempts > 0 ? (
              <Text className="text-[13px] tabular-nums text-muted-foreground">
                {" · Attempt "}
                {cp.attempts}
              </Text>
            ) : null}
          </View>
        </View>
        {stoppable ? (
          <Popover items={[{ label: "Stop Build", icon: "close", danger: true, onPress: () => setConfirmStop(true) }]}>
            {(open, isOpen) => (
              <View className={isOpen ? "rounded-xl bg-foreground/5" : undefined}>
                <IconButton
                  icon="more"
                  accessibilityLabel="Build actions"
                  onPress={open}
                  style={{ backgroundColor: "transparent" }}
                />
              </View>
            )}
          </Popover>
        ) : null}
      </View>

      {error ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION_MS)}>
          <Notice text={error} error />
        </Animated.View>
      ) : null}

      {build.checkpoints.length === 0 ? (
        <View className="items-center justify-center gap-2.5 py-12">
          <Spinner size="sm" />
          <Text className="text-[13px] text-muted-foreground">Reading the Roadmap Item and drafting Checkpoints…</Text>
        </View>
      ) : (
        <>
          <View className="mt-4 rounded-[14px] border border-border p-4">
            <LoopVisual build={build} />
          </View>

          <Animated.View layout={reduced ? undefined : LAYOUT} className="mt-6 gap-2">
            <Text className="text-sm font-semibold text-foreground">Checkpoints</Text>
            {build.checkpoints.map((checkpoint, index) => (
              <CheckpointRow
                key={checkpoint.id}
                checkpoint={checkpoint}
                current={index === build.current}
                activeGate={activeGateKey(build.step)}
                sessionIds={build.sessionIds}
                onOpenSession={openSession}
              />
            ))}
          </Animated.View>

          {build.notes.length > 0 ? (
            <View className="mt-6 gap-1">
              <Text className="text-sm font-semibold text-foreground">Remembered feedback</Text>
              {build.notes.map((note, i) => (
                <Text key={i} className="text-[13px] leading-5 text-muted-foreground">
                  • {note}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}

      <ConfirmStop
        visible={confirmStop}
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => {
          setConfirmStop(false);
          void fire({ kind: "stop" });
        }}
      />
    </ScrollView>
  );
}

function CheckpointRow({
  checkpoint,
  current,
  activeGate,
  sessionIds,
  onOpenSession,
}: {
  checkpoint: Checkpoint;
  current: boolean;
  activeGate: GateKey | null;
  sessionIds: Id<"sessions">[];
  onOpenSession: (id: Id<"sessions">) => void;
}) {
  const ink = useInk();
  if (!current) {
    const dimmed = checkpoint.status === "pending";
    return (
      <View className={`min-h-9 flex-row items-center gap-2.5 ${dimmed ? "opacity-50" : ""}`}>
        <SymbolView
          name={checkpoint.status === "done" ? IconNames.done : IconNames.planned}
          size={16}
          tintColor={ink(checkpoint.status === "done" ? "pass" : "waiting")}
        />
        <Text numberOfLines={1} className="flex-1 text-sm font-medium text-foreground">
          {checkpoint.title}
        </Text>
        {checkpoint.ui ? <UiBadge /> : null}
        {checkpoint.commit ? (
          <Text selectable numberOfLines={1} className="font-mono text-xs text-muted-foreground">
            {checkpoint.commit.slice(0, 10)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-sm font-medium text-foreground">{checkpoint.title}</Text>
        {checkpoint.ui ? <UiBadge /> : null}
      </View>
      {checkpoint.description ? <Text className="text-[13px] leading-5 text-muted-foreground">{checkpoint.description}</Text> : null}
      {checkpoint.prototype ? (
        <Text selectable className="font-mono text-xs text-muted-foreground">
          {checkpoint.prototype}
        </Text>
      ) : null}

      <GateLine
        label="Implement"
        icon="compose"
        state={checkpoint.attempts > 0 ? "pass" : "waiting"}
        onPress={checkpoint.sessionId ? () => onOpenSession(checkpoint.sessionId!) : undefined}
      />
      {GATES.map((gate) => {
        const active = activeGate === gate && sessionIds.length > 0;
        const node = LOOP_NODES.find((n) => n.key === gate)!;
        if (active && gate === "review" && sessionIds.length > 1) {
          return (
            <View key={gate}>
              <GateLine label="Reviewer A" icon={node.icon} state={checkpoint.gates[gate]} onPress={() => onOpenSession(sessionIds[0]!)} />
              <GateLine label="Reviewer B" icon={node.icon} state={checkpoint.gates[gate]} onPress={() => onOpenSession(sessionIds[1]!)} />
            </View>
          );
        }
        return (
          <GateLine
            key={gate}
            label={GATE_LABEL[gate]}
            icon={node.icon}
            state={checkpoint.gates[gate]}
            onPress={active ? () => onOpenSession(sessionIds[0]!) : undefined}
          />
        );
      })}
      {checkpoint.findings ? (
        <Notice text={checkpoint.findings} error={checkpoint.gates.behavior === "fail" || checkpoint.gates.review === "fail"} />
      ) : null}
    </View>
  );
}

function UiBadge() {
  return (
    <Badge variant="outline" className="h-[18px] px-1.5">
      UI
    </Badge>
  );
}

function GateLine({
  label,
  icon,
  state,
  onPress,
}: {
  label: string;
  icon: IconName;
  state: Checkpoint["gates"][GateKey];
  onPress?: () => void;
}) {
  const ink = useInk();
  const color = ink(state);
  const content = (
    <>
      <SymbolView name={IconNames[icon]} size={14} tintColor={color} />
      <Text className="flex-1 text-[13px] text-foreground">{label}</Text>
      <Text className={`text-xs font-semibold ${state === "pass" ? "text-success" : state === "fail" ? "text-destructive" : state === "running" ? "text-primary" : "text-muted-foreground"}`}>
        {GATE_STATE_LABEL[state]}
      </Text>
      {onPress ? <SymbolView name={IconNames.chevronRight} size={11} tintColor={ink("waiting")} /> : null}
    </>
  );
  if (!onPress) return <View className="min-h-8 flex-row items-center gap-2 rounded-lg px-1">{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${label} Session`}
      onPress={onPress}
      className="min-h-8 flex-row items-center gap-2 rounded-lg px-1 active:bg-foreground/5">
      {content}
    </Pressable>
  );
}

function ConfirmStop({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Content className="w-full max-w-[380px]">
        <Dialog.Title>Stop this Build?</Dialog.Title>
        <Dialog.Description>
          This can&apos;t be undone. The worktree and branch stay on disk; nothing more will be committed.
        </Dialog.Description>
        <Dialog.Footer>
          <Button variant="ghost" onPress={onCancel}>Cancel</Button>
          <Button variant="destructive" onPress={onConfirm}>Stop</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

/** Sticky bottom card: whatever action is yours to take, or nothing while the Worker has it. */
export function BuildActionCard({ buildId }: { buildId: Id<"builds"> }) {
  const build = useQuery(api.builds.get, { buildId });
  const send = useMutation(api.builds.send);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [draft, setDraft] = useState<Array<PlannedCheckpoint & { id: string }>>([]);
  const rowRefs = useRef(new Map<string, View>());
  const nextId = useRef(0);

  useEffect(() => {
    if (build && build.step.kind === "approvePlan") {
      setDraft(
        build.checkpoints.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          tests: c.tests,
          ui: c.ui,
          prototype: c.prototype,
        })),
      );
    }
    // Reset the draft only when a fresh plan arrives, not on every poll tick.
  }, [build?._id, build?.step.kind]);

  if (!build) return null;

  async function send_(event: BuildEvent) {
    setBusy(true);
    setError("");
    try {
      await send({ buildId, event });
      setFeedback("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the Worker.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDrop(id: string, translationY: number) {
    const rows = await Promise.all(
      draft.map(async (c) => {
        const r = await measure(rowRefs.current.get(c.id));
        return r ? { id: c.id, top: r.y, height: r.height } : null;
      }),
    );
    const valid = rows.filter((r): r is { id: string; top: number; height: number } => r !== null);
    const own = valid.find((r) => r.id === id);
    if (!own) return;
    const section: DropSection = { value: null, top: -Infinity, bottom: Infinity, rows: valid };
    const target = dropTarget([section], id, own.top + own.height / 2 + translationY, draft.map((c) => c.id));
    if (!target) return;
    setDraft((prev) => moveCheckpointDraft(prev, id, target.beforeItemId));
  }

  if (build.status === "paused") {
    return (
      <View className="w-full max-w-[760px] gap-2.5 self-center border-t border-border bg-card p-4">
        {build.error ? <Notice text={build.error} error /> : null}
        {error ? <Notice text={error} error /> : null}
        <Action label={busy ? "Resuming…" : "Resume"} emphasis disabled={busy} onPress={() => void send_({ kind: "resume" })} />
        <FeedbackField value={feedback} onChange={setFeedback} busy={busy} onSend={() => void send_({ kind: "feedback", text: feedback })} />
      </View>
    );
  }

  if (build.step.kind === "approvePlan") {
    return (
      <View className="w-full max-w-[760px] gap-2.5 self-center border-t border-border bg-card p-4">
        <Text className="text-sm font-semibold text-foreground">Approve the Checkpoints</Text>
        {error ? <Notice text={error} error /> : null}
        <ScrollView className="max-h-[280px]" keyboardShouldPersistTaps="handled">
          {draft.map((row) => (
            <DragRow
              key={row.id}
              surface="bg-card"
              rowRef={(view) => {
                if (view) rowRefs.current.set(row.id, view);
                else rowRefs.current.delete(row.id);
              }}
              onDrop={(dy) => handleDrop(row.id, dy)}
            >
              <PlanRow
                row={row}
                onChange={(next) => setDraft((prev) => prev.map((c) => (c.id === row.id ? next : c)))}
                onDelete={() => setDraft((prev) => prev.filter((c) => c.id !== row.id))}
              />
            </DragRow>
          ))}
        </ScrollView>
        <View className="mt-1 flex-row items-center justify-between">
          <Action
            icon="add"
            label="Add Checkpoint"
            onPress={() =>
              setDraft((prev) => [...prev, { id: `draft${nextId.current++}`, title: "", description: "", tests: "", ui: false }])
            }
          />
          <Action
            label={busy ? "Starting…" : "Start building"}
            emphasis
            disabled={busy || draft.filter((r) => r.title.trim()).length === 0}
            onPress={() =>
              void send_({
                kind: "planApproved",
                checkpoints: draft
                  .filter((r) => r.title.trim())
                  .map((r) => ({ title: r.title.trim(), description: r.description.trim(), tests: r.tests, ui: r.ui, prototype: r.prototype })),
              })
            }
          />
        </View>
      </View>
    );
  }

  if (build.step.kind === "finalReview" && build.status === "waiting") {
    return (
      <View className="w-full max-w-[760px] gap-2.5 self-center border-t border-border bg-card p-4">
        <Text className="text-sm font-semibold text-foreground">Try the Build</Text>
        <Text className="text-[13px] leading-5 text-muted-foreground">
          Every Checkpoint is committed on <Text className="font-mono">{build.branch}</Text>. Run it from the worktree below,
          then approve or send feedback — feedback becomes new Checkpoints that run through every Gate.
        </Text>
        {build.worktree ? (
          <Text selectable className="mt-1 font-mono text-xs text-muted-foreground">
            {build.worktree}
          </Text>
        ) : null}
        {error ? <Notice text={error} error /> : null}
        <Action label={busy ? "Approving…" : "Approve"} emphasis disabled={busy} onPress={() => void send_({ kind: "approved" })} />
        <FeedbackField value={feedback} onChange={setFeedback} busy={busy} onSend={() => void send_({ kind: "feedback", text: feedback })} />
      </View>
    );
  }

  if (build.status === "done") {
    return (
      <View className="w-full max-w-[760px] gap-2.5 self-center border-t border-border bg-card p-4">
        <Text className="text-sm font-medium text-foreground">
          All Checkpoints committed on <Text className="font-mono">{build.branch}</Text>.
        </Text>
        {build.worktree ? (
          <Text selectable className="mt-1 font-mono text-xs text-muted-foreground">
            {build.worktree}
          </Text>
        ) : null}
      </View>
    );
  }

  return null;
}

function FeedbackField({
  value,
  onChange,
  busy,
  onSend,
}: {
  value: string;
  onChange: (text: string) => void;
  busy: boolean;
  onSend: () => void;
}) {
  return (
    <View className="gap-2">
      <Textarea
        value={value}
        onChangeText={onChange}
        placeholder="Feedback for the next Checkpoint…"
        rows={3}
      />
      <Action label="Send feedback" disabled={busy || !value.trim()} onPress={onSend} />
    </View>
  );
}

function PlanRow({
  row,
  onChange,
  onDelete,
}: {
  row: PlannedCheckpoint & { id: string };
  onChange: (next: PlannedCheckpoint & { id: string }) => void;
  onDelete: () => void;
}) {
  return (
    <View className="my-0.5 gap-1 rounded-[10px] border border-border p-2">
      <View className="flex-row items-center gap-1.5">
        <Input
          value={row.title}
          onChangeText={(title) => onChange({ ...row, title })}
          placeholder="Checkpoint title"
          containerClassName="flex-1"
          accessibilityLabel="Checkpoint title"
        />
        <Chip
          size="sm"
          selected={row.ui}
          accessibilityLabel={row.ui ? "UI Gate on for this Checkpoint" : "UI Gate off for this Checkpoint"}
          onPress={() => onChange({ ...row, ui: !row.ui })}>
          UI
        </Chip>
        <Button size="icon" variant="ghost" accessibilityLabel="Delete Checkpoint" onPress={onDelete}>
          <XIcon size={14} />
        </Button>
      </View>
      <Textarea
        value={row.description}
        onChangeText={(description) => onChange({ ...row, description })}
        placeholder="What does this slice do?"
        rows={2}
      />
      <Textarea
        value={row.tests}
        onChangeText={(tests) => onChange({ ...row, tests })}
        placeholder="Test plan"
        rows={2}
      />
      {row.prototype ? (
        <Text selectable numberOfLines={1} className="font-mono text-xs text-muted-foreground">
          {row.prototype}
        </Text>
      ) : null}
    </View>
  );
}

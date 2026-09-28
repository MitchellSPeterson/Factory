// One Build: the loop visual for the active Checkpoint, the Checkpoint timeline below it, and
// a sticky action card when it's the engineer's turn. Mirrors roadmap/ItemDetail.tsx's shell.
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutRectangle,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import Animated, { FadeIn, LinearTransition, useReducedMotion, ZoomIn } from "react-native-reanimated";
import { useMutation, useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Action, Notice } from "@/chats/ui";
import { IconButton, IconNames, type IconName } from "@/components/icon-button";
import { Popover } from "@/roadmap/Popover";
import { DragRow } from "@/roadmap/DragRow";
import { dropTarget, type DropSection } from "@/roadmap/reorder";
import { EASE_OUT, MOTION_MS } from "@/roadmap/meta";
import { LoopVisual } from "@/build/LoopVisual";
import { BUILD_STATUS_LABEL, GATE_LABEL, GATE_STATE_LABEL, LOOP_NODES, buildStatusColor, gateStateColor } from "@/build/meta";
import { GATES, type BuildEvent, type Checkpoint, type GateKey, type PlannedCheckpoint, type Step } from "../../../shared/helix";

const LAYOUT = LinearTransition.duration(MOTION_MS).easing(EASE_OUT);
const web = Platform.OS === "web";
const noOutline = web ? ({ outlineStyle: "none" } as object) : null;

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
  const theme = useTheme();
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
      <View style={styles.center}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }
  if (build === null) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>This Build was removed.</Text>
      </View>
    );
  }

  const cp = build.checkpoints[build.current];
  const stoppable = build.status !== "done" && build.status !== "stopped";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <View style={styles.titleWrap}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>
            {build.title}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: buildStatusColor(theme, build.status) }]} />
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{BUILD_STATUS_LABEL[build.status]}</Text>
            {build.checkpoints.length > 0 ? (
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {" · Checkpoint "}
                {build.current + 1} of {build.checkpoints.length}
              </Text>
            ) : null}
            {cp && cp.attempts > 0 ? (
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontVariant: ["tabular-nums"] }}>
                {" · Attempt "}
                {cp.attempts}
              </Text>
            ) : null}
          </View>
        </View>
        {stoppable ? (
          <Popover items={[{ label: "Stop Build", icon: "close", danger: true, onPress: () => setConfirmStop(true) }]}>
            {(open, isOpen) => (
              <IconButton
                icon="more"
                accessibilityLabel="Build actions"
                onPress={open}
                style={{ backgroundColor: isOpen ? theme.subtleHover : "transparent" }}
              />
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
        <View style={styles.planning}>
          <ActivityIndicator color={theme.textSecondary} />
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Reading the Roadmap Item and drafting Checkpoints…</Text>
        </View>
      ) : (
        <>
          <View style={[styles.card, { borderColor: theme.line }]}>
            <LoopVisual build={build} />
          </View>

          <Animated.View layout={reduced ? undefined : LAYOUT} style={styles.timeline}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Checkpoints</Text>
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
            <View style={styles.notes}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Remembered feedback</Text>
              {build.notes.map((note, i) => (
                <Text key={i} style={[styles.note, { color: theme.textSecondary }]}>
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
  const theme = useTheme();
  if (!current) {
    const dimmed = checkpoint.status === "pending";
    return (
      <View style={[styles.cpRow, dimmed && { opacity: 0.5 }]}>
        <SymbolView
          name={checkpoint.status === "done" ? IconNames.done : IconNames.planned}
          size={16}
          tintColor={checkpoint.status === "done" ? theme.success : theme.textSecondary}
        />
        <Text numberOfLines={1} style={[styles.cpTitle, { color: theme.text, flex: 1 }]}>
          {checkpoint.title}
        </Text>
        {checkpoint.ui ? <UiBadge /> : null}
        {checkpoint.commit ? (
          <Text selectable numberOfLines={1} style={[styles.commit, { color: theme.textSecondary }]}>
            {checkpoint.commit.slice(0, 10)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.cpCurrent, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cpTitleRow}>
        <Text style={[styles.cpTitle, { color: theme.text, flex: 1 }]}>{checkpoint.title}</Text>
        {checkpoint.ui ? <UiBadge /> : null}
      </View>
      {checkpoint.description ? <Text style={[styles.cpDesc, { color: theme.textSecondary }]}>{checkpoint.description}</Text> : null}
      {checkpoint.prototype ? (
        <Text selectable style={[styles.commit, { color: theme.textSecondary }]}>
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
        <View style={styles.findings}>
          <Notice text={checkpoint.findings} error={checkpoint.gates.behavior === "fail" || checkpoint.gates.review === "fail"} />
        </View>
      ) : null}
    </View>
  );
}

function UiBadge() {
  const theme = useTheme();
  return (
    <View style={[styles.uiBadge, { borderColor: theme.line }]}>
      <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: "700" }}>UI</Text>
    </View>
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
  const theme = useTheme();
  const color = gateStateColor(theme, state);
  const content = (
    <>
      <SymbolView name={IconNames[icon]} size={14} tintColor={color} />
      <Text style={[styles.gateLabel, { color: theme.text }]}>{label}</Text>
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{GATE_STATE_LABEL[state]}</Text>
      {onPress ? <SymbolView name={IconNames.chevronRight} size={11} tintColor={theme.textSecondary} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.gateRow}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${label} Session`}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.gateRow,
        styles.gateRowPress,
        (pressed || hovered) && { backgroundColor: theme.subtleHover },
      ]}
    >
      {content}
    </Pressable>
  );
}

function ConfirmStop({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.overlay}>
        <Pressable accessibilityLabel="Dismiss" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <Animated.View
          entering={reduced ? undefined : ZoomIn.duration(200).easing(EASE_OUT)}
          accessibilityViewIsModal
          style={[styles.dialog, { backgroundColor: theme.backgroundElement, borderColor: theme.line }]}
        >
          <Text style={[styles.dialogTitle, { color: theme.text }]}>Stop this Build?</Text>
          <Text style={[styles.dialogBody, { color: theme.textSecondary }]}>
            This can't be undone. The worktree and branch stay on disk; nothing more will be committed.
          </Text>
          <View style={styles.dialogActions}>
            <Action label="Cancel" onPress={onCancel} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop Build"
              onPress={onConfirm}
              style={({ pressed }) => [styles.dialogDanger, { backgroundColor: pressed ? "#d63f38" : theme.danger }]}
            >
              <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "600" }}>Stop</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/** Sticky bottom card: whatever action is yours to take, or nothing while the Worker has it. */
export function BuildActionCard({ buildId }: { buildId: Id<"builds"> }) {
  const theme = useTheme();
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
      <View style={[styles.actionCard, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
        {build.error ? <Notice text={build.error} error /> : null}
        {error ? <Notice text={error} error /> : null}
        <Action label={busy ? "Resuming…" : "Resume"} emphasis disabled={busy} onPress={() => void send_({ kind: "resume" })} />
        <FeedbackField value={feedback} onChange={setFeedback} busy={busy} onSend={() => void send_({ kind: "feedback", text: feedback })} />
      </View>
    );
  }

  if (build.step.kind === "approvePlan") {
    return (
      <View style={[styles.actionCard, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Approve the Checkpoints</Text>
        {error ? <Notice text={error} error /> : null}
        <ScrollView style={styles.planList} keyboardShouldPersistTaps="handled">
          {draft.map((row) => (
            <DragRow
              key={row.id}
              surface={theme.backgroundElement}
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
        <View style={styles.planActions}>
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
      <View style={[styles.actionCard, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Try the Build</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19 }}>
          Every Checkpoint is committed on <Text style={{ fontFamily: "ui-monospace" }}>{build.branch}</Text>. Run it from the worktree below,
          then approve or send feedback — feedback becomes new Checkpoints that run through every Gate.
        </Text>
        {build.worktree ? (
          <Text selectable style={[styles.worktree, { color: theme.textSecondary }]}>
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
      <View style={[styles.actionCard, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "500" }}>
          All Checkpoints committed on <Text style={{ fontFamily: "ui-monospace" }}>{build.branch}</Text>.
        </Text>
        {build.worktree ? (
          <Text selectable style={[styles.worktree, { color: theme.textSecondary }]}>
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
  const theme = useTheme();
  return (
    <View style={styles.feedbackRow}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Feedback for the next Checkpoint…"
        placeholderTextColor={theme.textSecondary}
        multiline
        style={[styles.feedbackInput, { color: theme.text, borderColor: theme.line }, noOutline]}
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
  const theme = useTheme();
  return (
    <View style={[styles.planRow, { borderColor: theme.line }]}>
      <View style={styles.planRowTop}>
        <TextInput
          value={row.title}
          onChangeText={(title) => onChange({ ...row, title })}
          placeholder="Checkpoint title"
          placeholderTextColor={theme.textSecondary}
          style={[styles.planTitleInput, { color: theme.text }, noOutline]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={row.ui ? "UI Gate on for this Checkpoint" : "UI Gate off for this Checkpoint"}
          accessibilityState={{ selected: row.ui }}
          onPress={() => onChange({ ...row, ui: !row.ui })}
          style={[styles.uiToggle, { borderColor: row.ui ? theme.accent : theme.line }, row.ui && { backgroundColor: theme.accent }]}
        >
          <Text style={{ color: row.ui ? theme.background : theme.textSecondary, fontSize: 10, fontWeight: "700" }}>UI</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete Checkpoint" onPress={onDelete} style={styles.planDelete}>
          <SymbolView name={IconNames.close} size={13} tintColor={theme.textSecondary} />
        </Pressable>
      </View>
      <TextInput
        value={row.description}
        onChangeText={(description) => onChange({ ...row, description })}
        placeholder="What does this slice do?"
        placeholderTextColor={theme.textSecondary}
        multiline
        style={[styles.planDescInput, { color: theme.textSecondary }, noOutline]}
      />
      <TextInput
        value={row.tests}
        onChangeText={(tests) => onChange({ ...row, tests })}
        placeholder="Test plan"
        placeholderTextColor={theme.textSecondary}
        multiline
        style={[styles.planDescInput, { color: theme.textSecondary }, noOutline]}
      />
      {row.prototype ? (
        <Text selectable numberOfLines={1} style={[styles.commit, { color: theme.textSecondary }]}>
          {row.prototype}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, maxWidth: 760, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginRight: -8 },
  titleWrap: { flex: 1, gap: 4, minWidth: 0 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  statusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  planning: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 48 },
  card: { marginTop: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, borderCurve: "continuous", padding: 16 },
  timeline: { marginTop: 24, gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "600" },
  cpRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  cpTitle: { fontSize: 14, fontWeight: "500" },
  cpDesc: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  commit: { fontFamily: "ui-monospace", fontSize: 12 },
  cpCurrent: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, borderCurve: "continuous", padding: 12, gap: 8 },
  cpTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  uiBadge: { height: 18, paddingHorizontal: 6, borderRadius: 5, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  gateRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32, paddingHorizontal: 4, borderRadius: 8, borderCurve: "continuous" },
  gateRowPress: { marginHorizontal: -4 },
  gateLabel: { flex: 1, fontSize: 13 },
  findings: { marginTop: 2 },
  notes: { marginTop: 24, gap: 4 },
  note: { fontSize: 13, lineHeight: 19 },
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "center", padding: 16 },
  dialog: {
    width: 380,
    maxWidth: "100%",
    alignSelf: "center",
    padding: 20,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: "continuous",
    boxShadow: "0 20px 48px rgba(0,0,0,0.3)",
  },
  dialogTitle: { fontSize: 17, fontWeight: "600" },
  dialogBody: { fontSize: 13, lineHeight: 20 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 10, gap: 6 },
  dialogDanger: { minHeight: 40, paddingHorizontal: 16, borderRadius: 10, borderCurve: "continuous", alignItems: "center", justifyContent: "center" },
  actionCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  feedbackRow: { gap: 8 },
  feedbackInput: {
    minHeight: 60,
    padding: 10,
    borderRadius: 10,
    borderCurve: "continuous",
    borderWidth: 1,
    fontSize: 13,
    textAlignVertical: "top",
  },
  worktree: { fontFamily: "ui-monospace", fontSize: 12, marginTop: 4 },
  planList: { maxHeight: 280 },
  planActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  planRow: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, borderCurve: "continuous", padding: 8, marginVertical: 3, gap: 4 },
  planRowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  planTitleInput: { flex: 1, fontSize: 14, fontWeight: "500", height: 32 },
  planDelete: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  uiToggle: { height: 22, minWidth: 30, paddingHorizontal: 7, borderRadius: 6, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  planDescInput: { fontSize: 12, lineHeight: 17, minHeight: 32 },
});

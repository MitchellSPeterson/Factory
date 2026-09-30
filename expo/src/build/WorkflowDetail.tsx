import { useState } from "react";
import { Image, Linking, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "panelui-native/components/button";
import { Dialog } from "panelui-native/components/dialog";
import { Input } from "panelui-native/components/input";
import { Spinner } from "panelui-native/components/spinner";
import { Textarea } from "panelui-native/components/textarea";
import { Text } from "panelui-native/primitives/text";
import { api } from "@/lib/api";
import type { Doc, Id } from "@/lib/dataModel";
import { useMutation } from "@/lib/factory";
import { Notice } from "@/chats/ui";
import { Popover } from "@/roadmap/Popover";
import { ArtifactPreview } from "./ArtifactPreview";
import { useBuildArtifact, type PreviewAnchor } from "./artifacts";
import { ROLE_LABEL } from "./BuildSettings";
import {
  resourceBlocker,
  type WorkflowAction,
  type WorkflowArtifact,
  type WorkflowPhase,
  type WorkflowReport,
  type WorkflowState,
} from "../../../shared/buildWorkflow";

export const WORKFLOW_PHASE_LABEL: Record<WorkflowPhase, string> = {
  setup: "Discovering Project setup",
  refine: "Refining Requirements",
  prototype: "Creating Prototype",
  prototypeReview: "Prototype review",
  plan: "Planning automatically",
  build: "Implementing the plan",
  verify: "Verifying Candidate",
  review: "Reviewing Candidate",
  publish: "Preparing PR and evidence",
  prReview: "PR review",
  done: "Merged",
};
type UserAction = WorkflowAction extends infer Action
  ? Action extends WorkflowAction
    ? Omit<Action, "id" | "generation" | "phase">
    : never
  : never;
function identity() {
  return `factory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function minutes(value: number) {
  return `${Math.round(value / 60000)} min`;
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-5 gap-3">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

export function WorkflowDetail({
  build,
  onClose: _onClose,
}: {
  build: Doc<"builds">;
  onClose: () => void;
}) {
  const workflow = build.workflow!;
  const send = useMutation(api.builds.action);
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stop, setStop] = useState(false);
  const [changeDialog, setChangeDialog] = useState(false);
  const [changes, setChanges] = useState("");
  const [changesDesign, setChangesDesign] = useState(false);
  const [ceilingDialog, setCeilingDialog] = useState(false);
  const [runtimeCeiling, setRuntimeCeiling] = useState(
    String(workflow.config.runtimeCeilingMs / 60000),
  );
  const [tokenCeiling, setTokenCeiling] = useState(
    workflow.config.tokenCeiling === undefined
      ? ""
      : String(workflow.config.tokenCeiling),
  );
  const [showSessions, setShowSessions] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [decision, setDecision] = useState("");
  async function fire(action: UserAction) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await send({
        buildId: build._id,
        action: {
          ...action,
          id: identity(),
          generation: workflow.generation,
          phase: workflow.phase,
        } as WorkflowAction,
      });
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not reach the Worker.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openSession(id: string) {
    router.push({
      pathname: "/chats",
      params: { session: id, back: `/build?build=${build._id}` },
    });
  }
  const terminal = workflow.status === "done" || workflow.status === "stopped";
  const currentRevision = workflow.candidateRevision;
  const prReady =
    workflow.phase === "prReview" &&
    workflow.status === "waiting" &&
    workflow.pr?.state === "open" &&
    workflow.pr.head === currentRevision &&
    workflow.reports.verifier?.revision === currentRevision &&
    workflow.reports.reviewer?.revision === currentRevision;
  const stages = Object.values(workflow.stages).filter(
    (stage) => stage?.generation === workflow.generation,
  );
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="w-full max-w-[900px] self-center px-5 pb-10 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text className="text-[24px] font-bold leading-8 tracking-tight text-foreground">
          {build.title}
        </Text>
        <Text className="text-[13px] text-muted-foreground">
          {workflow.status === "paused"
            ? "Paused · "
            : workflow.status === "stopped"
              ? "Stopped · "
              : ""}
          {WORKFLOW_PHASE_LABEL[workflow.phase]}
        </Text>
      </View>
      <View className="mt-4 flex-row flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
        <Text className="text-xs tabular-nums text-foreground">
          Batch {workflow.batch.number} · {workflow.batch.attempts}/3 builder
          attempts
        </Text>
        <Text className="text-xs tabular-nums text-muted-foreground">
          {minutes(workflow.runtimeMs)} /{" "}
          {minutes(workflow.config.runtimeCeilingMs)}
        </Text>
        {workflow.tokens > 0 && (
          <Text className="text-xs tabular-nums text-muted-foreground">
            {workflow.tokens.toLocaleString()} tokens
            {workflow.config.tokenCeiling
              ? ` / ${workflow.config.tokenCeiling.toLocaleString()}`
              : ""}
          </Text>
        )}
        {workflow.costCents > 0 && (
          <Text className="text-xs tabular-nums text-muted-foreground">
            ${(workflow.costCents / 100).toFixed(2)} measured
          </Text>
        )}
        <Button
          variant="ghost"
          disabled={busy || terminal}
          onPress={() => setCeilingDialog(true)}
        >
          Limits
        </Button>
      </View>
      {!!error && (
        <View className="mt-3">
          <Notice text={error} error />
        </View>
      )}
      {!!workflow.error && (
        <View className="mt-3">
          <Notice text={workflow.error} error />
        </View>
      )}
      {workflow.configurationIssues.map((issue, index) => (
        <View className="mt-2" key={index}>
          <Notice text={issue} error />
        </View>
      ))}
      {workflow.status === "paused" && (
        <View className="mt-4 gap-2 rounded-xl border border-border p-4">
          <Text className="text-sm font-semibold text-foreground">
            {workflow.blocker === "budget"
              ? "This Batch used all three attempts"
              : workflow.blocker === "decision"
                ? "A scope or behavior decision needs your answer"
                : workflow.blocker === "externalHead"
                  ? "PR head changed · earlier evidence is invalid"
                  : workflow.blocker === "resource"
                    ? resourceBlocker(workflow)
                      ? "Build resource limit reached"
                      : "Resource limit raised · ready to resume"
                    : "Work and evidence are preserved"}
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {workflow.blocker === "budget"
              ? "Continue explicitly authorizes a new Batch with three attempts. The lifetime resource limits stay in place."
              : workflow.blocker === "decision"
                ? "Your answer becomes Notes and restarts refinement within the current Batch."
                : workflow.blocker === "externalHead"
                  ? "Request changes explicitly authorizes a new Batch to review and update the same PR."
                  : workflow.blocker === "resource"
                    ? resourceBlocker(workflow)
                      ? "Raise the exhausted lifetime limit, then Resume the same work."
                      : "Resume recovers the same work with the raised lifetime limit."
                    : "Resume recovers this work within the current Batch and consumed budget."}
          </Text>
          {workflow.blocker === "decision" ? (
            <View className="gap-2">
              <Textarea
                label="Resolve the scope or behavior decision"
                value={decision}
                onChangeText={setDecision}
                placeholder="Tell Factory how to proceed…"
              />
              <Button
                className="self-start"
                disabled={
                  busy || !decision.trim() || !!resourceBlocker(workflow)
                }
                onPress={async () => {
                  if (
                    await fire({
                      kind: "answerDecision",
                      text: decision.trim(),
                    })
                  )
                    setDecision("");
                }}
              >
                Save decision and continue
              </Button>
            </View>
          ) : workflow.blocker === "externalHead" ? (
            <Button
              className="self-start"
              disabled={busy}
              onPress={() => setChangeDialog(true)}
            >
              Request changes · new Batch
            </Button>
          ) : (
            <Button
              className="self-start"
              disabled={busy || !!resourceBlocker(workflow)}
              onPress={() =>
                void fire({
                  kind: workflow.blocker === "budget" ? "continue" : "resume",
                })
              }
            >
              {workflow.blocker === "budget"
                ? "Continue · new Batch"
                : "Resume"}
            </Button>
          )}
        </View>
      )}
      {!terminal && (
        <View className="mt-3 flex-row gap-2">
          {workflow.status === "running" && (
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => void fire({ kind: "pause" })}
            >
              Pause
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onPress={() => setStop(true)}>
            Stop Build
          </Button>
        </View>
      )}
      {stages.length > 0 && (
        <Panel title="Active Sessions">
          {stages.map(
            (stage) =>
              stage && (
                <Pressable
                  key={stage.id}
                  accessibilityRole="button"
                  onPress={() => openSession(stage.sessionId)}
                  className="flex-row items-center gap-2"
                >
                  <Spinner size="sm" />
                  <Text className="text-sm text-primary">
                    {ROLE_LABEL[stage.role]} · Open Session
                  </Text>
                </Pressable>
              ),
          )}
        </Panel>
      )}
      {workflow.prototypeRevisions.length > 0 && (
        <PrototypeReview
          key={build._id}
          buildId={build._id}
          workflow={workflow}
          busy={busy}
          fire={fire}
        />
      )}
      {workflow.phase === "prototype" && (
        <Panel title="Prototype">
          <Text className="text-sm text-muted-foreground">
            The agent is preparing the next preserved revision. Prototype review
            does not consume builder attempts.
          </Text>
        </Panel>
      )}
      {workflow.requirements.length > 0 && (
        <Panel title="Requirements">
          {workflow.requirements.map((requirement) => {
            const evidence = workflow.reports.verifier?.requirements.find(
              (item) => item.requirementId === requirement.id,
            );
            return (
              <View key={requirement.id} className="gap-1">
                <Text className="text-sm leading-5 text-foreground">
                  {evidence ? (evidence.pass ? "✓ " : "× ") : "○ "}
                  {requirement.text}
                </Text>
                {evidence && (
                  <Text
                    className={`text-xs leading-5 ${evidence.pass ? "text-muted-foreground" : "text-destructive"}`}
                  >
                    {evidence.evidence}
                  </Text>
                )}
              </View>
            );
          })}
        </Panel>
      )}
      {workflow.plan.length > 0 && (
        <Panel title="Implementation plan">
          {workflow.plan.map((checkpoint, index) => (
            <View
              key={index}
              className="gap-1 rounded-xl border border-border p-3"
            >
              <Text className="text-sm font-medium text-foreground">
                {index + 1}. {checkpoint.title}
              </Text>
              <Text className="text-xs leading-5 text-muted-foreground">
                {checkpoint.description}
              </Text>
            </View>
          ))}
          <Text className="text-xs text-muted-foreground">
            Checkpoints organize one complete Candidate. Planning proceeds
            automatically.
          </Text>
        </Panel>
      )}
      {currentRevision && (
        <Panel title="Candidate">
          <Text selectable className="text-xs font-mono text-muted-foreground">
            {currentRevision}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(["verifier", "reviewer"] as const).map((role) => {
              const report = workflow.reports[role];
              const valid = report?.revision === currentRevision;
              return (
                <View
                  key={role}
                  className="flex-1 rounded-xl border border-border p-3"
                >
                  <Text className="text-sm font-medium text-foreground">
                    {ROLE_LABEL[role]}
                  </Text>
                  <Text
                    className={`mt-1 text-xs ${valid && report?.pass ? "text-success" : "text-muted-foreground"}`}
                  >
                    {!report
                      ? "Awaiting report"
                      : !valid
                        ? "Evidence belongs to an earlier revision"
                        : report.environmentBlocker
                          ? "Environment blocked"
                          : report.pass
                            ? "Passed"
                            : "Blocking findings"}
                  </Text>
                </View>
              );
            })}
          </View>
        </Panel>
      )}
      {Object.values(workflow.reports).map(
        (report) =>
          report && (
            <ReportView
              key={`${report.role}-${report.revision}`}
              report={report}
              currentRevision={currentRevision}
              onOpenSession={openSession}
            />
          ),
      )}
      {workflow.findings.length > 0 && (
        <Panel title="Findings">
          {workflow.findings.map((finding) => (
            <View
              key={finding.id}
              className="gap-1 rounded-xl border border-border p-3"
            >
              <Text
                className={`text-xs font-semibold ${finding.severity === "blocking" && !finding.resolved ? "text-destructive" : "text-muted-foreground"}`}
              >
                {finding.resolved
                  ? "Resolved"
                  : finding.severity === "blocking"
                    ? "Blocking"
                    : "Suggestion"}
                {finding.file
                  ? ` · ${finding.file}${finding.line ? `:${finding.line}` : ""}`
                  : ""}
              </Text>
              <Text className="text-sm leading-5 text-foreground">
                {finding.text}
              </Text>
              <Text
                selectable
                className="text-xs leading-5 text-muted-foreground"
              >
                {finding.evidence}
              </Text>
              <Text className="text-xs leading-5 text-muted-foreground">
                {finding.impact}
              </Text>
            </View>
          ))}
        </Panel>
      )}
      {workflow.artifacts.some((artifact) => artifact.kind !== "prototype") && (
        <EvidenceView
          buildId={build._id}
          artifacts={workflow.artifacts.filter(
            (artifact) => artifact.kind !== "prototype",
          )}
          currentRevision={currentRevision}
        />
      )}
      {workflow.pr && (
        <Panel title="Pull request">
          <View className="gap-2 rounded-xl border border-border p-4">
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(workflow.pr!.url)}
            >
              <Text className="text-sm font-semibold text-primary">
                Open PR #{workflow.pr.number} ↗
              </Text>
            </Pressable>
            <Text className="text-xs text-muted-foreground">
              {workflow.pr.state === "merged"
                ? "Merged · Roadmap Item done"
                : workflow.pr.state === "closed"
                  ? "Closed without merging · automatic work paused"
                  : prReady
                    ? "Ready for your review. You control merging."
                    : "Updated work must pass all required Gates before review."}
            </Text>
            <Text className="text-xs leading-5 text-muted-foreground">
              Retained evidence requires this authorized Worker to be reachable.
            </Text>
            {workflow.pr.state === "open" && !terminal && (
              <Button
                className="self-start"
                disabled={busy}
                onPress={() => setChangeDialog(true)}
              >
                Request changes
              </Button>
            )}
          </View>
          <View className="gap-2 rounded-xl border border-border p-3">
            <Textarea
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="Add feedback without starting work…"
            />
            <Button
              variant="ghost"
              className="self-start"
              disabled={busy || !feedbackText.trim() || terminal}
              onPress={async () => {
                if (
                  await fire({
                    kind: "feedback",
                    feedback: {
                      id: identity(),
                      text: feedbackText.trim(),
                      source: "factory",
                      authorized: false,
                      changesDesign: false,
                      createdAt: Date.now(),
                    },
                  })
                )
                  setFeedbackText("");
              }}
            >
              Add feedback
            </Button>
            <Text className="text-xs text-muted-foreground">
              Comments accumulate. Request changes explicitly authorizes work.
            </Text>
          </View>
        </Panel>
      )}
      {workflow.pendingFeedback.length > 0 && (
        <Panel title="Incoming feedback">
          <Text className="text-xs leading-5 text-muted-foreground">
            Collected for the next Batch. Active Candidate review stays on the
            same revision.
          </Text>
          {workflow.pendingFeedback.map((feedback) => (
            <View
              key={feedback.id}
              className="gap-1 rounded-xl border border-border p-3"
            >
              <Text className="text-xs text-muted-foreground">
                {feedback.source === "github" ? "GitHub" : "Factory"} ·{" "}
                {feedback.authorized ? "Authorized review" : "Feedback"}
              </Text>
              <Text className="text-sm leading-5 text-foreground">
                {feedback.text}
              </Text>
            </View>
          ))}
        </Panel>
      )}
      {workflow.feedbackHistory.length > 0 && (
        <Panel title="Feedback history">
          {workflow.feedbackHistory.map((feedback) => (
            <View key={feedback.id} className="gap-1">
              <Text className="text-xs text-muted-foreground">
                {feedback.source === "github" ? "GitHub" : "Factory"}
                {feedback.changesDesign ? " · Design change" : ""}
              </Text>
              <Text className="text-sm leading-5 text-foreground">
                {feedback.text}
              </Text>
            </View>
          ))}
        </Panel>
      )}
      {workflow.candidates.length > 0 && (
        <Panel title="Candidate history">
          {workflow.candidates.map((candidate) => (
            <View
              key={`${candidate.batch}-${candidate.attempt}`}
              className="gap-1 rounded-xl border border-border p-3"
            >
              <Text className="text-xs text-muted-foreground">
                Batch {candidate.batch} · Attempt {candidate.attempt}
              </Text>
              <Text selectable className="text-xs font-mono text-foreground">
                {candidate.revision}
              </Text>
              {candidate.reports.map((report) => (
                <View key={report.role} className="flex-row flex-wrap gap-2">
                  <Text className="text-xs text-muted-foreground">
                    {ROLE_LABEL[report.role]} ·{" "}
                    {report.environmentBlocker
                      ? "Environment blocked"
                      : report.pass
                        ? "Passed"
                        : "Failed"}
                  </Text>
                  {report.sessionId && (
                    <Pressable onPress={() => openSession(report.sessionId!)}>
                      <Text className="text-xs text-primary">Open Session</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ))}
        </Panel>
      )}
      {workflow.notes.length > 0 && (
        <Panel title="Notes">
          {workflow.notes.map((note, index) => (
            <Text
              key={index}
              className="text-sm leading-5 text-muted-foreground"
            >
              {note}
            </Text>
          ))}
        </Panel>
      )}
      {workflow.sessionIds.length > 0 && (
        <Panel title="Session history">
          <Button
            variant="ghost"
            className="self-start"
            onPress={() => setShowSessions(!showSessions)}
          >
            {showSessions
              ? "Hide Sessions"
              : `${workflow.sessionIds.length} preserved Sessions`}
          </Button>
          {showSessions &&
            workflow.sessionIds.map((id, index) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                onPress={() => openSession(id)}
              >
                <Text className="py-1 text-xs text-primary">
                  Session {index + 1} · {id}
                </Text>
              </Pressable>
            ))}
        </Panel>
      )}
      <Dialog open={stop} onOpenChange={setStop}>
        <Dialog.Content className="w-full max-w-[400px]">
          <Dialog.Title>Stop this Build?</Dialog.Title>
          <Dialog.Description>
            Automatic work ends. The work, Sessions, evidence, and existing PR
            remain available.
          </Dialog.Description>
          <Dialog.Footer>
            <Button variant="ghost" onPress={() => setStop(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onPress={async () => {
                if (await fire({ kind: "stop" })) setStop(false);
              }}
            >
              Stop Build
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
      <Dialog open={changeDialog} onOpenChange={setChangeDialog}>
        <Dialog.Content className="w-full max-w-[480px] gap-3">
          <Dialog.Title>Request changes</Dialog.Title>
          <Dialog.Description>
            This explicitly authorizes a new Batch for the same Build and PR.
            Feedback arriving during active work is saved for the next Batch.
          </Dialog.Description>
          <Textarea
            value={changes}
            onChangeText={setChanges}
            placeholder="What needs to change?"
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: changesDesign }}
            onPress={() => setChangesDesign(!changesDesign)}
            className="flex-row items-center gap-2"
          >
            <View
              className={`h-4 w-4 rounded border ${changesDesign ? "bg-primary border-primary" : "border-border"}`}
            />
            <Text className="flex-1 text-sm text-foreground">
              Changes the approved layout or behavior
            </Text>
          </Pressable>
          <Text className="text-xs leading-5 text-muted-foreground">
            {changesDesign
              ? "Factory returns to Prototype review before implementation."
              : "Factory corrects implementation against the existing approved design."}
          </Text>
          <Dialog.Footer>
            <Button variant="ghost" onPress={() => setChangeDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !changes.trim()}
              onPress={async () => {
                if (
                  await fire({
                    kind: "requestChanges",
                    text: changes.trim(),
                    changesDesign,
                  })
                ) {
                  setChangeDialog(false);
                  setChanges("");
                }
              }}
            >
              Request changes
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
      <Dialog open={ceilingDialog} onOpenChange={setCeilingDialog}>
        <Dialog.Content className="w-full max-w-[440px] gap-3">
          <Dialog.Title>Build lifetime limits</Dialog.Title>
          <Input
            label="Runtime ceiling (minutes)"
            keyboardType="numeric"
            value={runtimeCeiling}
            onChangeText={setRuntimeCeiling}
          />
          <Input
            label="Token ceiling (optional)"
            keyboardType="numeric"
            value={tokenCeiling}
            onChangeText={setTokenCeiling}
          />
          <Dialog.Description>
            Raise an exhausted ceiling explicitly. Continuing a Batch does not
            reset lifetime usage. This Worker supports time and token bounds;
            monetary caps are unavailable.
          </Dialog.Description>
          <Dialog.Footer>
            <Button variant="ghost" onPress={() => setCeilingDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                !(Number(runtimeCeiling) > 0) ||
                (!!tokenCeiling && !(Number(tokenCeiling) > 0))
              }
              onPress={async () => {
                if (
                  await fire({
                    kind: "raiseCeiling",
                    runtimeCeilingMs: Number(runtimeCeiling) * 60000,
                    tokenCeiling: tokenCeiling.trim()
                      ? Number(tokenCeiling)
                      : undefined,
                  })
                )
                  setCeilingDialog(false);
              }}
            >
              Save limits
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </ScrollView>
  );
}

function PrototypeReview({
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

function ReportView({
  report,
  currentRevision,
  onOpenSession,
}: {
  report: WorkflowReport;
  currentRevision?: string;
  onOpenSession: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Panel title={`${ROLE_LABEL[report.role]} report`}>
      <View className="gap-2 rounded-xl border border-border p-3">
        <Text className="text-xs font-mono text-muted-foreground">
          Candidate {report.revision}
          {report.revision !== currentRevision ? " · Earlier evidence" : ""}
        </Text>
        {!!report.environmentBlocker && (
          <Notice text={report.environmentBlocker} error />
        )}
        {report.productChanged && (
          <Notice
            text="Product code changed during review. This report cannot approve the Candidate."
            error
          />
        )}
        {report.sessionId && (
          <Pressable
            onPress={() => onOpenSession(report.sessionId!)}
            accessibilityRole="button"
          >
            <Text className="text-xs text-primary">Open preserved Session</Text>
          </Pressable>
        )}
        <Button
          variant="ghost"
          className="self-start"
          onPress={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Hide executed checks"
            : `${report.checks.length} executed checks`}
        </Button>
        {expanded &&
          report.checks.map((check, index) => (
            <View key={index} className="gap-1 rounded-lg bg-background p-3">
              <Text selectable className="text-xs font-mono text-foreground">
                {check.command}
              </Text>
              <Text
                className={`text-xs ${check.exitCode === 0 ? "text-success" : "text-destructive"}`}
              >
                Exit {check.exitCode} ·{" "}
                {new Date(check.executedAt).toLocaleString()}
              </Text>
              <Text
                selectable
                className="text-xs font-mono leading-5 text-muted-foreground"
              >
                {check.output || "No output"}
              </Text>
            </View>
          ))}
      </View>
    </Panel>
  );
}

function EvidenceView({
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

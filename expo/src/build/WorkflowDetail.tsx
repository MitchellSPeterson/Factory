import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "panelui-native/components/button";
import { Dialog } from "panelui-native/components/dialog";
import { Input } from "panelui-native/components/input";
import { Spinner } from "panelui-native/components/spinner";
import { Textarea } from "panelui-native/components/textarea";
import { Text } from "panelui-native/primitives/text";
import { api } from "@/lib/api";
import type { Doc } from "@/lib/dataModel";
import { useMutation } from "@/lib/factory";
import { Notice } from "@/chats/ui";
import { ROLE_LABEL } from "./BuildSettings";
import {
  resourceBlocker,
  type WorkflowAction,
  type WorkflowPhase,
} from "../../../shared/buildWorkflow";
import { CandidateHistoryPanel } from "./workflow/CandidateHistoryPanel";
import { CandidatePanel } from "./workflow/CandidatePanel";
import { EvidenceView } from "./workflow/EvidenceView";
import {
  FeedbackHistoryPanel,
  IncomingFeedbackPanel,
} from "./workflow/FeedbackPanels";
import { FindingsPanel } from "./workflow/FindingsPanel";
import { PlanPanel } from "./workflow/PlanPanel";
import { PrototypeReview } from "./workflow/PrototypeReview";
import { ReportView } from "./workflow/ReportView";
import { RequirementsPanel } from "./workflow/RequirementsPanel";
import { Panel, identity, type UserAction } from "./workflow/shared";

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
function minutes(value: number) {
  return `${Math.round(value / 60000)} min`;
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
        <RequirementsPanel workflow={workflow} />
      )}
      {workflow.plan.length > 0 && <PlanPanel workflow={workflow} />}
      {currentRevision && (
        <CandidatePanel workflow={workflow} currentRevision={currentRevision} />
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
      {workflow.findings.length > 0 && <FindingsPanel workflow={workflow} />}
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
        <IncomingFeedbackPanel workflow={workflow} />
      )}
      {workflow.feedbackHistory.length > 0 && (
        <FeedbackHistoryPanel workflow={workflow} />
      )}
      {workflow.candidates.length > 0 && (
        <CandidateHistoryPanel workflow={workflow} openSession={openSession} />
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

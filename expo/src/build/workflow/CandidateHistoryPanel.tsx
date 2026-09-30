import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import { ROLE_LABEL } from "../BuildSettings";
import { Pressable } from "react-native";
import type { WorkflowState } from "../../../../shared/buildWorkflow";
import { Panel } from "./shared";

export function CandidateHistoryPanel({
  workflow,
  openSession,
}: {
  workflow: WorkflowState;
  openSession: (id: string) => void;
}) {
  return (
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
  );
}

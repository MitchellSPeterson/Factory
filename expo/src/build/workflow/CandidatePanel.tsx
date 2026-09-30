import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import { ROLE_LABEL } from "../BuildSettings";
import type { WorkflowState } from "../../../../shared/buildWorkflow";
import { Panel } from "./shared";

export function CandidatePanel({
  workflow,
  currentRevision,
}: {
  workflow: WorkflowState;
  currentRevision: string;
}) {
  return (
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
  );
}

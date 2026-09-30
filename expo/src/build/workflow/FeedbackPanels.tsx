import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import type { WorkflowState } from "../../../../shared/buildWorkflow";
import { Panel } from "./shared";

export function IncomingFeedbackPanel({
  workflow,
}: {
  workflow: WorkflowState;
}) {
  return (
    <Panel title="Incoming feedback">
      <Text className="text-xs leading-5 text-muted-foreground">
        Collected for the next Batch. Active Candidate review stays on the same
        revision.
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
  );
}

export function FeedbackHistoryPanel({
  workflow,
}: {
  workflow: WorkflowState;
}) {
  return (
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
  );
}

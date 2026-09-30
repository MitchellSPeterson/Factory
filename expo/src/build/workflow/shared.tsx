import { View } from "react-native";
import { Text } from "panelui-native/primitives/text";
import type { WorkflowAction } from "../../../../shared/buildWorkflow";

export type UserAction = WorkflowAction extends infer Action
  ? Action extends WorkflowAction
    ? Omit<Action, "id" | "generation" | "phase">
    : never
  : never;
export function identity() {
  return `factory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export function Panel({
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

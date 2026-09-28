// One AgentPick (provider + model + effort), for the Send to Build dialog. Reuses the chat
// model picker's building blocks (ProviderMark, PickerChip, modelTitle, effortLabel) instead
// of the full chat ModelMenu overlay, which carries favorites/search/rails this dialog doesn't need.
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { AGENT_EFFORTS, providerLabel } from "../../../shared/agentModel";
import type { AgentPick } from "../../../shared/helix";
import { PickerChip, effortLabel, modelTitle } from "@/chats/model-picker";
import { Popover } from "@/roadmap/Popover";

export type ChatModelOption = { provider: AgentPick["provider"]; model: string; title: string };

export function AgentPickField({
  label,
  value,
  onChange,
  models,
}: {
  label: string;
  value: AgentPick;
  onChange: (next: AgentPick) => void;
  models: ChatModelOption[];
}) {
  const theme = useTheme();
  const current = models.find((m) => m.provider === value.provider && m.model === value.model);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.row}>
        <Popover
          align="left"
          items={models.map((m) => ({
            label: `${m.title} · ${providerLabel(m.provider)}`,
            selected: m.provider === value.provider && m.model === value.model,
            onPress: () => onChange({ ...value, provider: m.provider, model: m.model }),
          }))}
        >
          {(open) => (
            <PickerChip label={current?.title ?? modelTitle(value.model)} icon={value.provider} open={false} onPress={open} />
          )}
        </Popover>
        <Popover
          align="left"
          items={AGENT_EFFORTS.map((effort) => ({
            label: effortLabel(effort),
            selected: effort === value.effort,
            onPress: () => onChange({ ...value, effort }),
          }))}
        >
          {(open) => <PickerChip label={effortLabel(value.effort)} open={false} onPress={open} />}
        </Popover>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});

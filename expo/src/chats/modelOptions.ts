import {
  AGENT_EFFORTS,
  DEFAULT_AGENT_EFFORT,
  PERMISSION_MODES,
  SERVICE_TIERS,
  permissionModeDescription,
  permissionModeLabel,
  serviceTierDescription,
  serviceTierLabel,
} from "../../../convex/lib/agentModel";
import type { ChatSettings } from "./lastSettings";

export type PickerOptionId = "effort" | "service" | "runtime";

export type PickerChoice = {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
};

export function effortLabel(effort: string) {
  if (effort === "xhigh") return "Extra High";
  if (effort === "low") return "Low";
  if (effort === "medium") return "Medium";
  if (effort === "high") return "High";
  if (effort === "max") return "Max";
  if (effort === "ultra") return "Ultra";
  return effort;
}

export function pickerOptionRows(settings: ChatSettings): Array<{
  id: PickerOptionId;
  label: string;
  value: string;
  valueLabel: string;
}> {
  const rows: Array<{
    id: PickerOptionId;
    label: string;
    value: string;
    valueLabel: string;
  }> = [
    {
      id: "effort",
      label: "Reasoning",
      value: settings.effort,
      valueLabel: effortLabel(settings.effort),
    },
  ];
  if (settings.provider === "codex") {
    rows.push({
      id: "service",
      label: "Service Tier",
      value: settings.serviceTier,
      valueLabel: serviceTierLabel(settings.serviceTier),
    });
  }
  rows.push({
    id: "runtime",
    label: "Runtime",
    value: settings.permissionMode,
    valueLabel: permissionModeLabel(settings.permissionMode),
  });
  return rows;
}

export function pickerChoices(id: PickerOptionId): { title: string; choices: PickerChoice[] } {
  if (id === "effort") {
    return {
      title: "Reasoning",
      choices: AGENT_EFFORTS.map((effort) => ({
        id: effort,
        label: effortLabel(effort),
        isDefault: effort === DEFAULT_AGENT_EFFORT,
      })),
    };
  }
  if (id === "service") {
    return {
      title: "Service Tier",
      choices: SERVICE_TIERS.map((tier) => ({
        id: tier,
        label: serviceTierLabel(tier),
        description: serviceTierDescription(tier),
        isDefault: tier === "standard",
      })),
    };
  }
  return {
    title: "Runtime",
    choices: PERMISSION_MODES.map((mode) => ({
      id: mode,
      label: permissionModeLabel(mode),
      description: permissionModeDescription(mode),
      isDefault: mode === "supervised",
    })),
  };
}

export function applyPickerChoice(
  settings: ChatSettings,
  id: PickerOptionId,
  value: string,
): ChatSettings {
  if (id === "effort") {
    const effort = AGENT_EFFORTS.find((candidate) => candidate === value);
    return effort ? { ...settings, effort } : settings;
  }
  if (id === "service") {
    const serviceTier = SERVICE_TIERS.find((candidate) => candidate === value);
    return serviceTier ? { ...settings, serviceTier } : settings;
  }
  if (id === "runtime") {
    const permissionMode = PERMISSION_MODES.find((candidate) => candidate === value);
    return permissionMode ? { ...settings, permissionMode } : settings;
  }
  return settings;
}

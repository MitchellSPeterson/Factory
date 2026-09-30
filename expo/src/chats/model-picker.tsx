import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Image, Platform, ScrollView, View, useWindowDimensions } from "react-native";
import { useCSSVariable } from "uniwind";

import { Badge } from "panelui-native/components/badge";
import { Button } from "panelui-native/components/button";
import { Card } from "panelui-native/components/card";
import { Input } from "panelui-native/components/input";
import { Item } from "panelui-native/components/item";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  StarIcon,
} from "panelui-native/icons";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import { Text } from "panelui-native/primitives/text";

import { useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import { favoriteId, useFavorites } from "./favorites";
import type { ChatSettings } from "./lastSettings";
import {
  applyPickerChoice,
  pickerChoices,
  pickerOptionRows,
  type PickerOptionId,
} from "./modelOptions";

type Provider = "codex" | "cursor" | "grok" | "claude" | "openai";
type Rail = "favorites" | Provider;
type ChatModel = { provider: Provider; model: string; title: string };

const PROVIDER_ICONS = {
  claude: require("../../assets/providerIcons/claude.png"),
  codex: require("../../assets/providerIcons/ChatGPT.webp"),
  cursor: require("../../assets/providerIcons/cursor.png"),
  grok: require("../../assets/providerIcons/grok-ai-icon.webp"),
} as const;

const PROVIDER_ICON_FIT = {
  claude: 0.9,
  codex: 1,
  cursor: 1,
  grok: 0.82,
} as const;

export function ProviderMark({ provider, size }: { provider: Provider; size: number }) {
  const foreground = useCSSVariable("--color-foreground") as string | undefined;
  if (provider === "openai") {
    return (
      <View className="items-center justify-center" style={{ width: size, height: size }}>
        <Text className="font-bold text-foreground" style={{ fontSize: size * 0.55 }}>
          O
        </Text>
      </View>
    );
  }
  const fit = PROVIDER_ICON_FIT[provider];
  const dim = size * fit;
  return (
    <View className="shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <Image
        source={PROVIDER_ICONS[provider]}
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        style={{
          width: dim,
          height: dim,
          tintColor: provider === "cursor" || provider === "claude" ? undefined : foreground,
        }}
      />
    </View>
  );
}

export function modelTitle(id: string) {
  if (id === "grok-build-0.1") return "Grok Build";
  if (id === "opus" || id === "sonnet" || id === "haiku") {
    return "Claude " + id[0].toUpperCase() + id.slice(1);
  }
  if (id === "auto-smart" || id === "auto" || id === "default") return "Auto";
  if (id.startsWith("composer-")) return "Composer " + id.slice("composer-".length);
  if (id.startsWith("claude-opus-5")) return "Claude Opus 5";
  if (id.startsWith("gpt-")) {
    return (
      "GPT-" +
      id
        .slice(4)
        .replace(/(^|-)([a-z])/g, (_, sep: string, ch: string) => (sep ? "-" : "") + ch.toUpperCase())
    );
  }
  if (id.startsWith("grok-")) return "Grok " + id.slice(5);
  return id;
}

export { effortLabel } from "./modelOptions";

/** Models from providers that are switched on and signed in; undefined until the worker reports. */
export function useChatModels(): ChatModel[] | undefined {
  const live = useQuery(api.servers.local);
  return useMemo(() => {
    if (!live?.providerModels) return undefined;
    return live.providerModels
      .filter((entry) => entry.enabled && entry.authenticated)
      .flatMap((entry) =>
        entry.models.map((m) => ({ provider: entry.provider, model: m.id, title: m.name })),
      );
  }, [live?.providerModels]);
}

function asProvider(provider: string): Provider {
  if (provider === "grok" || provider === "cursor" || provider === "claude" || provider === "openai") {
    return provider;
  }
  return "codex";
}

function providerName(provider: string) {
  if (provider === "grok") return "Grok";
  if (provider === "cursor") return "Cursor";
  if (provider === "claude") return "Claude";
  if (provider === "openai") return "OpenAI";
  return "Codex";
}

export function MenuCard({ children, maxHeight }: { children: ReactNode; maxHeight: number }) {
  return (
    <Card className="mb-2 overflow-hidden" style={{ maxHeight }}>
      {children}
    </Card>
  );
}

export function PickerChip({
  label,
  open,
  filled,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  open: boolean;
  filled?: boolean;
  icon?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={open || filled ? "bg-surface" : ""}
      startContent={icon ? <ProviderMark provider={asProvider(icon)} size={16} /> : undefined}
      endContent={<ChevronDownIcon size={11} />}
    >
      <Text numberOfLines={1} className="max-w-[200px] text-[13px] font-semibold text-foreground">
        {label}
      </Text>
    </Button>
  );
}

export function ModelMenu({
  visible,
  current,
  disabled,
  optionIds,
  onChange,
}: {
  visible: boolean;
  current: ChatSettings;
  disabled?: boolean;
  /** Restrict the Options list (e.g. Build roles only take Reasoning). */
  optionIds?: PickerOptionId[];
  onChange: (next: ChatSettings) => void;
}) {
  const { height } = useWindowDimensions();
  const [muted, warning] = useCSSVariable(["--color-muted-foreground", "--color-warning"]) as (
    | string
    | undefined
  )[];
  const { ids, toggle } = useFavorites();
  const models = useChatModels();
  const providers = [...new Set((models ?? []).map((row) => row.provider))];
  const defaultRail: Rail = providers.includes(asProvider(current.provider))
    ? asProvider(current.provider)
    : (providers[0] ?? "favorites");
  const [railOverride, setRailOverride] = useState<Rail | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<PickerOptionId | "models">("models");
  const rail = railOverride ?? defaultRail;
  useEffect(() => {
    if (visible) return;
    setRailOverride(null);
    setQuery("");
    setPage("models");
  }, [visible]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models ?? [])
      .filter((row) => {
        if (rail === "favorites") return ids.includes(favoriteId(row.provider, row.model));
        if (row.provider !== rail) return false;
        return true;
      })
      .filter((row) => {
        if (!q) return true;
        return row.title.toLowerCase().includes(q) || row.model.toLowerCase().includes(q);
      });
  }, [models, rail, ids, query]);
  if (!visible) return null;
  const maxHeight = Math.min(560, Math.round(height * 0.68));
  if (page !== "models") {
    const spec = pickerChoices(page);
    return (
      <MenuCard maxHeight={maxHeight}>
        <Button
          variant="ghost"
          fullWidth
          accessibilityLabel={`Back to models, ${spec.title}`}
          onPress={() => setPage("models")}
          className="h-11 justify-start rounded-none border-b border-border px-3"
          startContent={<ChevronLeftIcon size={16} />}
          labelClassName="text-[15px] font-semibold"
        >
          {spec.title}
        </Button>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="py-1.5">
          {spec.choices.map((choice) => {
            const selected = choice.id === currentValue(current, page);
            return (
              <AnimatedPressable
                key={choice.id}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                accessibilityState={{ selected, disabled: !!disabled }}
                disabled={disabled}
                onPress={() => {
                  onChange(applyPickerChoice(current, page, choice.id));
                  setPage("models");
                }}
                className={`mx-1.5 mb-0.5 min-h-11 flex-row items-center justify-between gap-3 rounded-xl px-2.5 active:bg-primary/15 ${
                  selected ? "bg-primary/15" : "bg-transparent"
                } ${disabled ? "opacity-40" : ""}`}
              >
                <View className="flex-1 gap-0.5">
                  <Text className="text-[15px] font-medium text-foreground">{choice.label}</Text>
                  {choice.description ? (
                    <Text className="text-xs leading-4 text-muted-foreground">{choice.description}</Text>
                  ) : null}
                </View>
                {choice.isDefault ? <Badge variant="secondary">Default</Badge> : null}
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      </MenuCard>
    );
  }
  const optionRows = pickerOptionRows(current).filter((row) => !optionIds || optionIds.includes(row.id));
  return (
    <MenuCard maxHeight={maxHeight}>
      <View className="border-b border-border px-3 py-1.5">
        <Input
          accessibilityLabel="Search models"
          placeholder="Search models..."
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          variant="filled"
          size="sm"
          startContent={<SearchIcon size={16} />}
          interactiveContent={false}
          style={Platform.OS === "web" ? ({ outlineWidth: 0 } as object) : undefined}
        />
      </View>
      <View className="min-h-[310px] flex-1 flex-row">
        <View className="w-12 items-center gap-1 border-r border-border py-2">
          <RailButton
            label="Favorites"
            selected={rail === "favorites"}
            onPress={() => setRailOverride("favorites")}
          >
            <StarIcon
              size={18}
              filled={rail === "favorites"}
              color={rail === "favorites" ? warning : undefined}
            />
          </RailButton>
          {providers.map((provider) => (
            <RailButton
              key={provider}
              label={providerName(provider)}
              selected={rail === provider}
              onPress={() => setRailOverride(provider)}
            >
              <ProviderMark provider={provider} size={18} />
            </RailButton>
          ))}
        </View>
        <View className="min-w-0 flex-1">
          <ScrollView
            className="min-h-[180px] flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="p-1.5 pb-2.5"
          >
            {rows.length === 0 ? (
              <Text className="p-5 text-center text-[13px] leading-5 text-muted-foreground">
                {models === undefined
                  ? "Start the worker to load models."
                  : providers.length === 0
                    ? "No providers are on and signed in. Check Settings → Providers."
                    : rail === "favorites" && !query.trim()
                      ? "Star a model to pin it here."
                      : "No matching models."}
              </Text>
            ) : (
              rows.map((row) => {
                const id = favoriteId(row.provider, row.model);
                const selected = current.provider === row.provider && current.model === row.model;
                const favored = ids.includes(id);
                return (
                  <View
                    key={id}
                    className={`flex-row items-center rounded-xl ${selected ? "bg-primary/15" : ""}`}
                  >
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={row.title}
                      accessibilityState={{ selected, disabled: !!disabled }}
                      disabled={disabled}
                      onPress={() => onChange({ ...current, provider: row.provider, model: row.model })}
                      className={`min-h-[52px] flex-1 justify-center py-2.5 pl-2.5 ${disabled ? "opacity-40" : ""}`}
                    >
                      <Text className="text-[15px] font-semibold text-foreground">{row.title}</Text>
                      <View className="mt-0.5 flex-row items-center gap-1">
                        <ProviderMark provider={row.provider} size={12} />
                        <Text className="text-xs text-muted-foreground">{providerName(row.provider)}</Text>
                      </View>
                    </AnimatedPressable>
                    <Button
                      variant="ghost"
                      size="icon"
                      accessibilityLabel={favored ? `Unfavorite ${row.title}` : `Favorite ${row.title}`}
                      onPress={() => toggle(id)}
                      className="h-11 w-11"
                    >
                      <StarIcon size={18} filled={favored} color={favored ? warning : muted} />
                    </Button>
                  </View>
                );
              })
            )}
          </ScrollView>
          <View className="shrink-0 border-t border-border pb-1.5">
            <Text className="px-3.5 pb-1 pt-3 text-xs font-semibold text-muted-foreground">Options</Text>
            {optionRows.map((row, index) => (
              <View key={row.id}>
                <Item
                  size="sm"
                  disabled={disabled}
                  onPress={() => setPage(row.id)}
                  accessibilityLabel={`${row.label}, ${row.valueLabel}`}
                  className="min-h-11 rounded-none bg-transparent px-3.5"
                >
                  <Item.Content>
                    <Item.Title className="text-[15px] font-medium">{row.label}</Item.Title>
                  </Item.Content>
                  <Item.Actions className="gap-1">
                    <Text className="text-[15px] text-muted-foreground">{row.valueLabel}</Text>
                    <ChevronRightIcon size={12} />
                  </Item.Actions>
                </Item>
                {index < optionRows.length - 1 ? <Item.Separator className="mx-3.5" /> : null}
              </View>
            ))}
          </View>
        </View>
      </View>
    </MenuCard>
  );
}

function currentValue(settings: ChatSettings, page: PickerOptionId) {
  if (page === "effort") return settings.effort;
  if (page === "service") return settings.serviceTier;
  return settings.permissionMode;
}

function RailButton({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-9 w-9 items-center justify-center rounded-xl ${selected ? "bg-primary/15" : "bg-transparent"}`}
    >
      {selected ? <View className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-primary" /> : null}
      {children}
    </AnimatedPressable>
  );
}

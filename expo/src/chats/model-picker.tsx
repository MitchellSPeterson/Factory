import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { useTheme } from "@/hooks/use-theme";
import { Colors } from "@/constants/theme";
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  CURSOR_MODELS,
  GROK_MODELS,
  OPENAI_MODELS,
} from "../../../shared/agentModel";
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
  codex: require("../../assets/providerIcons/ChatGPT.webp"),
  cursor: require("../../assets/providerIcons/cursor.png"),
  grok: require("../../assets/providerIcons/grok-ai-icon.webp"),
} as const;

const PROVIDER_ICON_FIT = {
  codex: 1,
  cursor: 1,
  grok: 0.82,
} as const;

export function ProviderMark({ provider, size }: { provider: Provider; size: number }) {
  const theme = useTheme();
  if (provider === "claude" || provider === "openai") {
    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}>
        <Text style={{ color: theme.text, fontSize: size * 0.55, fontWeight: "700" }}>
          {provider === "claude" ? "C" : "O"}
        </Text>
      </View>
    );
  }
  const fit = PROVIDER_ICON_FIT[provider];
  const dim = size * fit;
  return (
    <View
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={PROVIDER_ICONS[provider]}
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        style={{
          width: dim,
          height: dim,
          tintColor: provider === "cursor" ? undefined : theme.text,
        }}
      />
    </View>
  );
}

const icons = {
  star: { ios: "star", android: "star_border", web: "star_border" },
  starFill: { ios: "star.fill", android: "star", web: "star" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  chevron: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  chevronRight: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  chevronLeft: { ios: "chevron.left", android: "chevron_left", web: "chevron_left" },
} as const;

const STAR = "#e8a317";

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
        .replace(/(^|-)([a-z])/g, (_, sep: string, ch: string) =>
          (sep ? "-" : "") + ch.toUpperCase(),
        )
    );
  }
  if (id.startsWith("grok-")) return "Grok " + id.slice(5);
  return id;
}

export { effortLabel } from "./modelOptions";

const CHAT_MODELS: ChatModel[] = [
  ...CODEX_MODELS.map((model) => ({
    provider: "codex" as const,
    model,
    title: modelTitle(model),
  })),
  ...CURSOR_MODELS.map((model) => ({
    provider: "cursor" as const,
    model,
    title: modelTitle(model),
  })),
  ...GROK_MODELS.map((model) => ({
    provider: "grok" as const,
    model,
    title: modelTitle(model),
  })),
  ...CLAUDE_MODELS.map((model) => ({
    provider: "claude" as const,
    model,
    title: modelTitle(model),
  })),
  ...OPENAI_MODELS.map((model) => ({
    provider: "openai" as const,
    model,
    title: modelTitle(model),
  })),
];

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

function MenuCard({ children, maxHeight }: { children: ReactNode; maxHeight: number }) {
  const theme = useTheme();
  const dark = theme.background === Colors.dark.background;
  return (
    <View
      style={[
        styles.card,
        {
          maxHeight,
          backgroundColor: dark ? "#2c2c2c" : "#ffffff",
          borderColor: theme.line,
        },
      ]}
    >
      {children}
    </View>
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
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor:
            open || filled || pressed ? theme.subtleHover : "transparent",
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
      ]}
    >
      {icon ? <ProviderMark provider={asProvider(icon)} size={16} /> : null}
      <Text
        numberOfLines={1}
        style={{ color: theme.text, fontSize: 13, fontWeight: "600", maxWidth: 200 }}
      >
        {label}
      </Text>
      <SymbolView name={icons.chevron} size={11} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

export function ModelMenu({
  visible,
  current,
  disabled,
  onChange,
}: {
  visible: boolean;
  current: ChatSettings;
  disabled?: boolean;
  onChange: (next: ChatSettings) => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const { ids, toggle } = useFavorites();
  const defaultRail: Rail = asProvider(current.provider);
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
    return CHAT_MODELS.filter((row) => {
      if (rail === "favorites") return ids.includes(favoriteId(row.provider, row.model));
      if (row.provider !== rail) return false;
      return true;
    }).filter((row) => {
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.model.toLowerCase().includes(q)
      );
    });
  }, [rail, ids, query]);
  if (!visible) return null;
  const selectedFill =
    theme.background === Colors.dark.background
      ? "rgba(255,255,255,0.08)"
      : "#f0f0f2";
  const maxHeight = Math.min(560, Math.round(height * 0.68));
  if (page !== "models") {
    const spec = pickerChoices(page);
    return (
      <MenuCard maxHeight={maxHeight}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to models, ${spec.title}`}
          onPress={() => setPage("models")}
          style={({ pressed }) => [
            styles.choiceHeader,
            { borderBottomColor: theme.lineStrong, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <SymbolView name={icons.chevronLeft} size={16} tintColor={theme.text} />
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
            {spec.title}
          </Text>
        </Pressable>
        <ScrollView keyboardShouldPersistTaps="handled">
          {spec.choices.map((choice, index) => {
            const selected = choice.id === currentValue(current, page);
            return (
              <Pressable
                key={choice.id}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                accessibilityState={{ selected, disabled: !!disabled }}
                disabled={disabled}
                onPress={() => {
                  onChange(applyPickerChoice(current, page, choice.id));
                  setPage("models");
                }}
                style={({ pressed }) => [
                  styles.effortRow,
                  {
                    backgroundColor: selected || pressed ? selectedFill : "transparent",
                    opacity: disabled ? 0.4 : 1,
                    transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
                    marginTop: index === 0 ? 6 : 0,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: "500" }}>
                    {choice.label}
                  </Text>
                  {choice.description ? (
                    <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16 }}>
                      {choice.description}
                    </Text>
                  ) : null}
                </View>
                {choice.isDefault ? (
                  <View style={[styles.defaultPill, { backgroundColor: theme.lineStrong }]}>
                    <Text style={{ color: theme.text, fontSize: 11, fontWeight: "600" }}>
                      Default
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </MenuCard>
    );
  }
  const optionRows = pickerOptionRows(current);
  return (
    <MenuCard maxHeight={maxHeight}>
      <View style={[styles.search, { borderBottomColor: theme.lineStrong }]}>
        <SymbolView name={icons.search} size={16} tintColor={theme.textSecondary} />
        <TextInput
          accessibilityLabel="Search models"
          placeholder="Search models..."
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          style={[
            styles.searchInput,
            { color: theme.text },
            Platform.OS === "web" ? ({ outlineWidth: 0 } as object) : null,
          ]}
        />
      </View>
      <View style={styles.body}>
        <View style={[styles.rail, { borderRightColor: theme.line }]}>
          <RailButton
            label="Favorites"
            selected={rail === "favorites"}
            selectedFill={selectedFill}
            onPress={() => setRailOverride("favorites")}
          >
            <SymbolView
              name={rail === "favorites" ? icons.starFill : icons.star}
              size={18}
              tintColor={rail === "favorites" ? STAR : theme.text}
            />
          </RailButton>
          <RailButton
            label="Codex"
            selected={rail === "codex"}
            selectedFill={selectedFill}
            onPress={() => setRailOverride("codex")}
          >
            <ProviderMark provider="codex" size={18} />
          </RailButton>
          <RailButton
            label="Cursor"
            selected={rail === "cursor"}
            selectedFill={selectedFill}
            onPress={() => setRailOverride("cursor")}
          >
            <ProviderMark provider="cursor" size={18} />
          </RailButton>
          <RailButton
            label="Grok"
            selected={rail === "grok"}
            selectedFill={selectedFill}
            onPress={() => setRailOverride("grok")}
          >
            <ProviderMark provider="grok" size={18} />
          </RailButton>
          <RailButton
            label="Claude"
            selected={rail === "claude"}
            selectedFill={selectedFill}
            onPress={() => setRailOverride("claude")}
          >
            <ProviderMark provider="claude" size={18} />
          </RailButton>
          <RailButton
            label="OpenAI"
            selected={rail === "openai"}
            selectedFill={selectedFill}
            onPress={() => setRailOverride("openai")}
          >
            <ProviderMark provider="openai" size={18} />
          </RailButton>
        </View>
        <View style={styles.main}>
          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
          >
            {rows.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textSecondary }]}>
                {rail === "favorites" && !query.trim()
                  ? "Star a model to pin it here."
                  : "No matching models."}
              </Text>
            ) : (
              rows.map((row) => {
                const id = favoriteId(row.provider, row.model);
                const selected =
                  current.provider === row.provider && current.model === row.model;
                const favored = ids.includes(id);
                return (
                  <View
                    key={id}
                    style={[
                      styles.row,
                      selected && { backgroundColor: selectedFill },
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={row.title}
                      accessibilityState={{ selected, disabled: !!disabled }}
                      disabled={disabled}
                      onPress={() =>
                        onChange({ ...current, provider: row.provider, model: row.model })
                      }
                      style={({ pressed }) => [
                        styles.rowMain,
                        {
                          opacity: disabled ? 0.4 : 1,
                          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
                        },
                      ]}
                    >
                      <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                        {row.title}
                      </Text>
                      <View style={styles.subtitle}>
                        <ProviderMark provider={row.provider} size={12} />
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {providerName(row.provider)}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        favored ? `Unfavorite ${row.title}` : `Favorite ${row.title}`
                      }
                      onPress={() => toggle(id)}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.star,
                        { transform: [{ scale: pressed ? 0.97 : 1 }] },
                      ]}
                    >
                      <SymbolView
                        name={favored ? icons.starFill : icons.star}
                        size={18}
                        tintColor={favored ? STAR : theme.textSecondary}
                      />
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={[styles.options, { borderTopColor: theme.lineStrong }]}>
            <Text style={[styles.section, { color: theme.textSecondary }]}>Options</Text>
            {optionRows.map((row, index) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={`${row.label}, ${row.valueLabel}`}
                disabled={disabled}
                onPress={() => setPage(row.id)}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    opacity: disabled ? 0.4 : 1,
                    backgroundColor: pressed ? selectedFill : "transparent",
                    borderBottomColor: theme.line,
                    borderBottomWidth:
                      index === optionRows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "500" }}>
                  {row.label}
                </Text>
                <View style={styles.optionValue}>
                  <Text style={{ color: theme.textSecondary, fontSize: 15 }}>
                    {row.valueLabel}
                  </Text>
                  <SymbolView
                    name={icons.chevronRight}
                    size={12}
                    tintColor={theme.textSecondary}
                  />
                </View>
              </Pressable>
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
  selectedFill,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  selectedFill: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.railBtn,
        {
          backgroundColor: selected || pressed ? selectedFill : "transparent",
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {selected ? (
        <View style={[styles.railMark, { backgroundColor: theme.accent }]} />
      ) : null}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 8,
    flexGrow: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0 12px 40px rgba(0,0,0,0.22)" },
      default: {},
    }),
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  // List min (~3 rows) + options footer; rail fits inside this.
  body: { flexDirection: "row", flex: 1, minHeight: 310 },
  rail: {
    width: 48,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    gap: 4,
    alignItems: "center",
  },
  main: { flex: 1, minWidth: 0 },
  railBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  railMark: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 1,
  },
  list: { flex: 1, minHeight: 180 },
  listContent: { padding: 6, paddingBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderCurve: "continuous",
  },
  rowMain: { flex: 1, paddingVertical: 10, paddingLeft: 10, minHeight: 52, justifyContent: "center" },
  subtitle: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  star: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 13, lineHeight: 20, padding: 20, textAlign: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  options: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
    flexShrink: 0,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 14,
    gap: 12,
  },
  optionValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  choiceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  section: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  effortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    marginHorizontal: 6,
    marginBottom: 2,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  defaultPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderCurve: "continuous",
  },
});

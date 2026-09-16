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
  AGENT_EFFORTS,
  CODEX_MODELS,
  CURSOR_MODELS,
  DEFAULT_AGENT_EFFORT,
  GROK_MODELS,
} from "../../../convex/lib/agentModel";
import { favoriteId, useFavorites } from "./favorites";

type Provider = "codex" | "cursor" | "grok";
type Rail = "favorites" | Provider;
type ChatModel = { provider: Provider; model: string; title: string };

const PROVIDER_ICONS = {
  codex: require("../../assets/providerIcons/ChatGPT.webp"),
  cursor: require("../../assets/providerIcons/cursor.png"),
  grok: require("../../assets/providerIcons/grok-ai-icon.webp"),
} as const;

function ProviderMark({ provider, size }: { provider: Provider; size: number }) {
  const theme = useTheme();
  return (
    <Image
      source={PROVIDER_ICONS[provider]}
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      style={{
        width: size,
        height: size,
        tintColor: provider === "cursor" ? undefined : theme.text,
      }}
    />
  );
}

const icons = {
  star: { ios: "star", android: "star_border", web: "star_border" },
  starFill: { ios: "star.fill", android: "star", web: "star" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  chevron: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
} as const;

const STAR = "#e8a317";

export function modelTitle(id: string) {
  if (id === "grok-build-0.1") return "Grok Build";
  if (id === "auto-smart") return "Auto";
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

export function effortLabel(effort: string) {
  if (effort === "xhigh") return "Extra High";
  if (effort === "low") return "Low";
  if (effort === "medium") return "Medium";
  if (effort === "high") return "High";
  if (effort === "max") return "Max";
  if (effort === "ultra") return "Ultra";
  return effort;
}

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
];

function asProvider(provider: string): Provider {
  if (provider === "grok" || provider === "cursor") return provider;
  return "codex";
}

function providerName(provider: string) {
  if (provider === "grok") return "Grok";
  if (provider === "cursor") return "Cursor";
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
        style={{ color: theme.text, fontSize: 13, fontWeight: "600", maxWidth: 140 }}
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
  onSelect,
}: {
  visible: boolean;
  current: { provider: string; model: string };
  disabled?: boolean;
  onSelect: (next: { provider: Provider; model: string }) => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const { ids, toggle } = useFavorites();
  const defaultRail: Rail = asProvider(current.provider);
  const [railOverride, setRailOverride] = useState<Rail | null>(null);
  const [query, setQuery] = useState("");
  const rail = railOverride ?? defaultRail;
  useEffect(() => {
    if (visible) return;
    setRailOverride(null);
    setQuery("");
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
  return (
    <MenuCard maxHeight={Math.min(340, Math.round(height * 0.48))}>
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
        </View>
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
                    onPress={() => onSelect({ provider: row.provider, model: row.model })}
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
      </View>
    </MenuCard>
  );
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

export function EffortMenu({
  visible,
  current,
  disabled,
  onSelect,
}: {
  visible: boolean;
  current: string;
  disabled?: boolean;
  onSelect: (effort: (typeof AGENT_EFFORTS)[number]) => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  if (!visible) return null;
  const selectedFill =
    theme.background === Colors.dark.background
      ? "rgba(255,255,255,0.08)"
      : "#f0f0f2";
  return (
    <MenuCard maxHeight={Math.min(340, Math.round(height * 0.48))}>
      <Text style={[styles.section, { color: theme.textSecondary }]}>Reasoning</Text>
      {AGENT_EFFORTS.map((effort) => {
        const selected = current === effort;
        return (
          <Pressable
            key={effort}
            accessibilityRole="button"
            accessibilityLabel={effortLabel(effort)}
            accessibilityState={{ selected, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onSelect(effort)}
            style={({ pressed }) => [
              styles.effortRow,
              {
                backgroundColor: selected || pressed ? selectedFill : "transparent",
                opacity: disabled ? 0.4 : 1,
                transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
              },
            ]}
          >
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: "500" }}>
              {effortLabel(effort)}
            </Text>
            {effort === DEFAULT_AGENT_EFFORT ? (
              <View style={[styles.defaultPill, { backgroundColor: theme.lineStrong }]}>
                <Text style={{ color: theme.text, fontSize: 11, fontWeight: "600" }}>
                  Default
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </MenuCard>
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
  body: { flexDirection: "row", flex: 1, minHeight: 180 },
  rail: {
    width: 48,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    gap: 4,
    alignItems: "center",
  },
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
  list: { flex: 1 },
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

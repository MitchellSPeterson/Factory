import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutRectangle,
} from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import { useMutation, useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Doc, Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Action, Notice } from "@/chats/ui";
import { IconButton, IconNames } from "@/components/icon-button";
import { DragRow } from "@/roadmap/DragRow";
import { ImportDialog } from "@/roadmap/ImportDialog";
import { Popover } from "@/roadmap/Popover";
import { EASE_OUT, KIND, MOTION_MS, STATUS, isClosed, kindColor, statusColor } from "@/roadmap/meta";
import { applyMove, dropTarget, groupPatch, type DropSection, type GroupBy } from "@/roadmap/reorder";
import { ROADMAP_STATUSES, type RoadmapKind } from "../../../shared/roadmap";

type Item = Doc<"roadmapItems">;
type Section = { key: string; label: string; value: string | null; shipped?: boolean; items: Item[] };

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "category", label: "Category" },
  { id: "status", label: "Status" },
  { id: "release", label: "Release" },
];
const LAYOUT = LinearTransition.duration(MOTION_MS).easing(EASE_OUT);

function buildSections(
  groupBy: GroupBy,
  items: Item[],
  categories: Doc<"roadmapCategories">[],
  releases: Doc<"roadmapReleases">[],
): Section[] {
  if (groupBy === "status") {
    return ROADMAP_STATUSES.map((status) => ({
      key: status,
      label: STATUS[status].label,
      value: status,
      items: items.filter((item) => item.status === status),
    })).filter((section) => section.items.length > 0);
  }
  const field = groupBy === "release" ? "releaseId" : "categoryId";
  const named: Omit<Section, "items">[] =
    groupBy === "release"
      ? releases.map((r) => ({ key: r._id, label: r.name, value: r.name, shipped: r.shipped }))
      : categories.map((c) => ({ key: c._id, label: c.name, value: c.name }));
  const sections: Section[] = named.map((section) => ({
    ...section,
    items: items.filter((item) => item[field] === section.key),
  }));
  sections.push({
    key: "none",
    label: groupBy === "release" ? "No release" : "Uncategorized",
    value: null,
    items: items.filter((item) => !item[field]),
  });
  return sections.filter((section) => section.items.length > 0);
}

function measure(view: View | null | undefined) {
  return new Promise<LayoutRectangle | null>((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

export function RoadmapList({
  projectId,
  surface,
  selectedId,
  onOpen,
}: {
  projectId: Id<"projects">;
  surface: string;
  selectedId: Id<"roadmapItems"> | undefined;
  onOpen: (id: Id<"roadmapItems">) => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const data = useQuery(api.roadmap.get, { projectId });
  const createItem = useMutation(api.roadmap.createItem);
  const moveItem = useMutation(api.roadmap.moveItem);
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["done", "dropped"]));
  const [showClosed, setShowClosed] = useState(false);
  const [composer, setComposer] = useState<{ section: Section | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [optimistic, setOptimistic] = useState<Item[] | null>(null);
  const rowRefs = useRef(new Map<string, View>());
  const sectionRefs = useRef(new Map<string, View>());

  // Server data replaces the optimistic copy as soon as it arrives.
  useEffect(() => setOptimistic(null), [data]);

  const items = optimistic ?? data?.items ?? [];
  const sections = useMemo(
    () => buildSections(groupBy, items, data?.categories ?? [], data?.releases ?? []),
    [groupBy, items, data],
  );

  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Rows actually on screen in a section; hidden rows would skew the drop math.
  function visibleRows(section: Section) {
    if (collapsed.has(section.key)) return [];
    if (groupBy === "status" || showClosed) return section.items;
    return section.items.filter((item) => !isClosed(item.status));
  }

  async function handleDrop(itemId: Id<"roadmapItems">, translationY: number) {
    const measured = await Promise.all(
      sections.map(async (section) => {
        const box = await measure(sectionRefs.current.get(section.key));
        const rows = await Promise.all(
          visibleRows(section).map(async (item) => {
            const r = await measure(rowRefs.current.get(item._id));
            return r ? { id: item._id as string, top: r.y, height: r.height } : null;
          }),
        );
        return box
          ? { value: section.value, top: box.y, bottom: box.y + box.height, rows: rows.filter((r) => r !== null) }
          : null;
      }),
    );
    const dropSections = measured.filter((s): s is DropSection => s !== null);
    const own = dropSections.flatMap((s) => s.rows).find((row) => row.id === itemId);
    if (!own) return;
    const target = dropTarget(dropSections, itemId, own.top + own.height / 2 + translationY, items.map((i) => i._id));
    if (!target) return;
    const patch = target.changedGroup ? groupPatch(groupBy, target.value) : undefined;
    const change: Partial<Item> = {};
    if (patch?.status) change.status = patch.status;
    if (patch && "category" in patch) {
      change.categoryId = data?.categories.find((c) => c.name === patch.category)?._id;
    }
    if (patch && "release" in patch) change.releaseId = data?.releases.find((r) => r.name === patch.release)?._id;
    setOptimistic(applyMove(items, itemId, target.beforeItemId, change));
    moveItem({ itemId, beforeItemId: target.beforeItemId, patch }).then(
      () => setError(""),
      (e) => {
        setOptimistic(null);
        setError(e instanceof Error ? e.message : "Could not move that item.");
      },
    );
  }

  async function create(title: string, kind: RoadmapKind) {
    const preset = composer?.section ? groupPatch(groupBy, composer.section.value) : {};
    try {
      const id = await createItem({ projectId, kind, title, ...preset });
      setError("");
      return id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that item.");
      throw e;
    }
  }

  const total = data?.items.length ?? 0;
  const closedCount = (data?.items ?? []).filter((item) => isClosed(item.status)).length;

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Segmented value={groupBy} onChange={setGroupBy} />
        <View style={styles.toolbarEnd}>
          <IconButton
            icon="add"
            accessibilityLabel="New item"
            onPress={() => setComposer(composer ? null : { section: null })}
            style={{ backgroundColor: composer && !composer.section ? theme.backgroundSelected : "transparent" }}
          />
          <Popover
            items={[
              { label: "Import GitHub issue", icon: "github", onPress: () => setImporting(true) },
              {
                label: showClosed ? "Hide done and dropped" : "Show done and dropped",
                icon: showClosed ? "dropped" : "done",
                onPress: () => setShowClosed((v) => !v),
              },
            ]}
          >
            {(open, isOpen) => (
              <IconButton
                icon="more"
                accessibilityLabel="More"
                onPress={open}
                style={{ backgroundColor: isOpen ? theme.subtleHover : "transparent" }}
              />
            )}
          </Popover>
        </View>
      </View>

      {composer && !composer.section ? (
        <Composer onSubmit={create} onClose={() => setComposer(null)} onCreated={onOpen} />
      ) : null}
      {error ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION_MS)} style={styles.error}>
          <Notice text={error} error />
        </Animated.View>
      ) : null}

      {data === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : total === 0 && !composer ? (
        <EmptyRoadmap onNew={() => setComposer({ section: null })} onImport={() => setImporting(true)} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {sections.map((section) => {
            const isCollapsed = collapsed.has(section.key);
            const rows = visibleRows(section);
            const hidden = isCollapsed ? 0 : section.items.length - rows.length;
            return (
              <Animated.View
                key={`${groupBy}:${section.key}`}
                layout={reduced ? undefined : LAYOUT}
                style={styles.section}
              >
                <View
                  ref={(view) => {
                    if (view) sectionRefs.current.set(section.key, view);
                    else sectionRefs.current.delete(section.key);
                  }}
                  collapsable={false}
                >
                  <SectionHeader
                    section={section}
                    collapsed={isCollapsed}
                    onToggle={() => toggleSection(section.key)}
                    onAdd={() => {
                      setCollapsed((prev) => new Set([...prev].filter((key) => key !== section.key)));
                      setComposer({ section });
                    }}
                  />
                  {composer?.section?.key === section.key ? (
                    <Composer
                      placeholder={`New item in ${section.label}`}
                      onSubmit={create}
                      onClose={() => setComposer(null)}
                      onCreated={onOpen}
                    />
                  ) : null}
                  {rows.map((item) => (
                    <DragRow
                      key={item._id}
                      surface={surface}
                      rowRef={(view) => {
                        if (view) rowRefs.current.set(item._id, view);
                        else rowRefs.current.delete(item._id);
                      }}
                      onDrop={(dy) => handleDrop(item._id, dy)}
                    >
                      <ItemRow
                        item={item}
                        groupBy={groupBy}
                        categoryName={data.categories.find((c) => c._id === item.categoryId)?.name}
                        releaseName={data.releases.find((r) => r._id === item.releaseId)?.name}
                        selected={selectedId === item._id}
                        onOpen={() => onOpen(item._id)}
                      />
                    </DragRow>
                  ))}
                  {hidden > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setShowClosed(true)}
                      style={({ pressed }) => [styles.hiddenNote, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[styles.hiddenText, { color: theme.textSecondary }]}>
                        {hidden} done or dropped · Show
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>
            );
          })}
          {closedCount > 0 && showClosed && groupBy !== "status" ? (
            <Pressable accessibilityRole="button" onPress={() => setShowClosed(false)} style={styles.hiddenNote}>
              <Text style={[styles.hiddenText, { color: theme.textSecondary }]}>Hide done and dropped</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <ImportDialog
        projectId={projectId}
        visible={importing}
        onClose={() => setImporting(false)}
        onImported={(id) => {
          setImporting(false);
          onOpen(id);
        }}
      />
    </View>
  );
}

function Segmented({ value, onChange }: { value: GroupBy; onChange: (next: GroupBy) => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [boxes, setBoxes] = useState<Partial<Record<GroupBy, { x: number; width: number }>>>({});
  const box = boxes[value];
  const indicator = useAnimatedStyle(() => {
    if (!box) return { opacity: 0 };
    const timing = { duration: reduced ? 0 : MOTION_MS, easing: EASE_OUT };
    return { opacity: 1, left: withTiming(box.x, timing), width: withTiming(box.width, timing) };
  }, [box, reduced]);
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: theme.subtleHover }]}>
      <Animated.View style={[styles.indicator, { backgroundColor: theme.backgroundElement }, indicator]} />
      {GROUPS.map((group) => (
        <Pressable
          key={group.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === group.id }}
          accessibilityLabel={`Group by ${group.label}`}
          onPress={() => onChange(group.id)}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            setBoxes((prev) => ({ ...prev, [group.id]: { x, width } }));
          }}
          style={styles.segment}
        >
          <Text
            style={{
              color: value === group.id ? theme.text : theme.textSecondary,
              fontSize: 12,
              fontWeight: value === group.id ? "600" : "500",
            }}
          >
            {group.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Chevron({ open, color }: { open: boolean; color: string }) {
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(
    () => ({
      transform: [{ rotate: withTiming(open ? "90deg" : "0deg", { duration: reduced ? 0 : 160, easing: EASE_OUT }) }],
    }),
    [open, reduced],
  );
  return (
    <Animated.View style={style}>
      <SymbolView name={IconNames.chevronRight} size={11} tintColor={color} />
    </Animated.View>
  );
}

function SectionHeader({
  section,
  collapsed,
  onToggle,
  onAdd,
}: {
  section: Section;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  const showAdd = hover || Platform.OS !== "web";
  return (
    <View
      style={styles.sectionHeader}
      {...(Platform.OS === "web" ? { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } : {})}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${section.label}, ${section.items.length} items`}
        onPress={onToggle}
        style={styles.sectionToggle}
      >
        <Chevron open={!collapsed} color={theme.textSecondary} />
        <Text numberOfLines={1} style={[styles.sectionLabel, { color: theme.text }]}>
          {section.label}
        </Text>
        <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>{section.items.length}</Text>
        {section.shipped ? (
          <View style={[styles.shipped, { backgroundColor: theme.backgroundSelected }]}>
            <Text style={{ color: theme.accent, fontSize: 10, fontWeight: "600" }}>Shipped</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add item to ${section.label}`}
        onPress={onAdd}
        style={({ pressed }) => [styles.sectionAdd, { opacity: showAdd ? (pressed ? 0.5 : 1) : 0 }]}
      >
        <SymbolView name={IconNames.add} size={14} tintColor={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

function ItemRow({
  item,
  groupBy,
  categoryName,
  releaseName,
  selected,
  onOpen,
}: {
  item: Item;
  groupBy: GroupBy;
  categoryName?: string;
  releaseName?: string;
  selected: boolean;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const status = STATUS[item.status];
  const doneCount = item.requirements.filter((r) => r.done).length;
  // Show the grouping the list isn't already showing.
  const context = groupBy === "release" ? categoryName : releaseName;
  const closed = isClosed(item.status);
  const meta = [
    context,
    item.requirements.length > 0 ? `${doneCount}/${item.requirements.length}` : null,
    ...item.tags,
  ].filter((part): part is string => !!part);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${KIND[item.kind].label}, ${status.label}`}
      accessibilityState={{ selected }}
      onPress={onOpen}
      onLongPress={Platform.OS === "web" ? undefined : () => {}}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        selected
          ? { backgroundColor: theme.backgroundSelected }
          : (pressed || hovered) && { backgroundColor: theme.subtleHover },
      ]}
    >
      <SymbolView name={IconNames[status.icon]} size={16} tintColor={statusColor(theme, item.status)} />
      <View style={styles.rowCopy}>
        <Text
          numberOfLines={2}
          style={[
            styles.rowTitle,
            { color: closed ? theme.textSecondary : theme.text },
            item.status === "dropped" && { textDecorationLine: "line-through" },
          ]}
        >
          {item.title}
        </Text>
        {meta.length > 0 || item.links.length > 0 ? (
          <View style={styles.rowMeta}>
            {meta.map((part, index) => (
              <Text key={`${part}:${index}`} style={[styles.rowMetaText, { color: theme.textSecondary }]}>
                {index > 0 ? "· " : ""}
                {part}
              </Text>
            ))}
            {item.links.length > 0 ? (
              <View style={styles.linkCount}>
                <SymbolView name={IconNames.link} size={11} tintColor={theme.textSecondary} />
                <Text style={[styles.rowMetaText, { color: theme.textSecondary }]}>{item.links.length}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <SymbolView name={IconNames[KIND[item.kind].icon]} size={13} tintColor={kindColor(theme, item.kind)} />
    </Pressable>
  );
}

function Composer({
  placeholder = "What do you want to build or fix?",
  onSubmit,
  onClose,
  onCreated,
}: {
  placeholder?: string;
  onSubmit: (title: string, kind: RoadmapKind) => Promise<Id<"roadmapItems">>;
  onClose: () => void;
  onCreated: (id: Id<"roadmapItems">) => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<RoadmapKind>("feature");
  const [busy, setBusy] = useState(false);

  // Enter adds and keeps the composer open for the next one; the Add button adds and opens the item.
  async function submit(openAfter: boolean) {
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const id = await onSubmit(text, kind);
      setTitle("");
      if (openAfter) {
        onClose();
        onCreated(id);
      }
    } catch {
      // The list shows the error; keep the typed title.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(MOTION_MS).easing(EASE_OUT)}
      exiting={reduced ? undefined : FadeOut.duration(120)}
      style={[styles.composer, { backgroundColor: theme.backgroundElement, borderColor: theme.line }]}
    >
      <TextInput
        value={title}
        onChangeText={setTitle}
        autoFocus
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={() => void submit(false)}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === "Escape") onClose();
        }}
        style={[styles.composerInput, { color: theme.text }, Platform.OS === "web" && ({ outlineStyle: "none" } as object)]}
      />
      <View style={styles.composerBar}>
        <View accessibilityRole="radiogroup" style={styles.kindToggle}>
          {(["feature", "fix"] as RoadmapKind[]).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
              onPress={() => setKind(k)}
              style={[styles.kindOption, kind === k && { backgroundColor: theme.subtleHover }]}
            >
              <SymbolView
                name={IconNames[KIND[k].icon]}
                size={12}
                tintColor={kind === k ? kindColor(theme, k) : theme.textSecondary}
              />
              <Text style={{ color: kind === k ? theme.text : theme.textSecondary, fontSize: 12, fontWeight: "500" }}>
                {KIND[k].label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.composerActions}>
          <Action label="Cancel" onPress={onClose} />
          <Action label={busy ? "Adding…" : "Add"} emphasis disabled={!title.trim() || busy} onPress={() => void submit(true)} />
        </View>
      </View>
    </Animated.View>
  );
}

function EmptyRoadmap({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyMark, { backgroundColor: theme.backgroundSelected }]}>
        <SymbolView name={IconNames.layers} size={22} tintColor={theme.accent} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Plan what's next</Text>
      <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
        Add the Features and Fixes you want to build. Group them by Category, then start a Session when you're ready.
      </Text>
      <View style={styles.emptyActions}>
        <Action label="New item" emphasis onPress={onNew} />
        <Action label="Import GitHub issue" onPress={onImport} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  toolbarEnd: { flexDirection: "row", alignItems: "center" },
  segmented: { flexDirection: "row", padding: 2, borderRadius: 9, borderCurve: "continuous" },
  indicator: {
    position: "absolute",
    top: 2,
    bottom: 2,
    borderRadius: 7,
    borderCurve: "continuous",
    boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
  },
  segment: { paddingHorizontal: 10, height: 28, justifyContent: "center" },
  error: { paddingHorizontal: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 6, paddingBottom: 40 },
  section: { marginTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", paddingLeft: 6, paddingRight: 2 },
  sectionToggle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minHeight: 32 },
  sectionLabel: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  sectionCount: { fontSize: 12, fontVariant: ["tabular-nums"] },
  sectionAdd: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  shipped: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderCurve: "continuous" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 4,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 3, marginTop: -1 },
  rowTitle: { fontSize: 14, lineHeight: 19, fontWeight: "500" },
  rowMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4 },
  rowMetaText: { fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
  linkCount: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 4 },
  hiddenNote: { paddingHorizontal: 36, paddingVertical: 6 },
  hiddenText: { fontSize: 12 },
  composer: {
    marginHorizontal: 10,
    marginVertical: 6,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  },
  composerInput: { fontSize: 14, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  composerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  kindToggle: { flexDirection: "row", gap: 2 },
  kindOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  composerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  emptyMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 280 },
  emptyActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 8 },
});

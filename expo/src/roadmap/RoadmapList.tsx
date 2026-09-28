import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View, type LayoutRectangle } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import { Badge } from "panelui-native/components/badge";
import { Chip } from "panelui-native/components/chip";
import { Input } from "panelui-native/components/input";
import { Item as Row } from "panelui-native/components/item";
import { Spinner } from "panelui-native/components/spinner";
import { Tabs } from "panelui-native/components/tabs";
import { ChevronRightIcon, PlusIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";
import { useMutation, useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Doc, Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Action, Notice } from "@/chats/ui";
import { EmptyState } from "@/components/empty-state";
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
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center justify-between gap-2 py-1.5 pl-3 pr-1.5">
        <Segmented value={groupBy} onChange={setGroupBy} />
        <View className="flex-row items-center">
          <View className={composer && !composer.section ? "rounded-xl bg-primary/15" : undefined}>
            <IconButton
              icon="add"
              accessibilityLabel="New item"
              onPress={() => setComposer(composer ? null : { section: null })}
              style={{ backgroundColor: "transparent" }}
            />
          </View>
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
              <View className={isOpen ? "rounded-xl bg-muted" : undefined}>
                <IconButton
                  icon="more"
                  accessibilityLabel="More"
                  onPress={open}
                  style={{ backgroundColor: "transparent" }}
                />
              </View>
            )}
          </Popover>
        </View>
      </View>

      {composer && !composer.section ? (
        <Composer onSubmit={create} onClose={() => setComposer(null)} onCreated={onOpen} />
      ) : null}
      {error ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION_MS)} className="px-3">
          <Notice text={error} error />
        </Animated.View>
      ) : null}

      {data === undefined ? (
        <View className="flex-1 items-center justify-center">
          <Spinner label="Loading roadmap" />
        </View>
      ) : total === 0 && !composer ? (
        <EmptyRoadmap onNew={() => setComposer({ section: null })} onImport={() => setImporting(true)} />
      ) : (
        <ScrollView contentContainerClassName="px-1.5 pb-10" keyboardShouldPersistTaps="handled">
          {sections.map((section) => {
            const isCollapsed = collapsed.has(section.key);
            const rows = visibleRows(section);
            const hidden = isCollapsed ? 0 : section.items.length - rows.length;
            return (
              <Animated.View
                key={`${groupBy}:${section.key}`}
                layout={reduced ? undefined : LAYOUT}
                className="mt-2"
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
                      className="px-9 py-1.5 active:opacity-60"
                    >
                      <Text className="text-xs text-muted-foreground">
                        {hidden} done or dropped · Show
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>
            );
          })}
          {closedCount > 0 && showClosed && groupBy !== "status" ? (
            <Pressable accessibilityRole="button" onPress={() => setShowClosed(false)} className="px-9 py-1.5">
              <Text className="text-xs text-muted-foreground">Hide done and dropped</Text>
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
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as GroupBy)} defaultValue="category" variant="segmented">
      <Tabs.List>
        {GROUPS.map((group) => (
          <Tabs.Trigger key={group.id} value={group.id}>
            {group.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

function Chevron({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(
    () => ({
      transform: [{ rotate: withTiming(open ? "90deg" : "0deg", { duration: reduced ? 0 : 160, easing: EASE_OUT }) }],
    }),
    [open, reduced],
  );
  return (
    <Animated.View style={style}>
      <ChevronRightIcon size={12} className="text-muted-foreground" />
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
  const [hover, setHover] = useState(false);
  const showAdd = hover || Platform.OS !== "web";
  return (
    <View
      className="flex-row items-center pl-1.5 pr-0.5"
      {...(Platform.OS === "web" ? { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } : {})}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${section.label}, ${section.items.length} items`}
        onPress={onToggle}
        className="min-h-8 flex-1 flex-row items-center gap-1.5"
      >
        <Chevron open={!collapsed} />
        <Text numberOfLines={1} className="shrink text-[13px] font-semibold text-foreground">
          {section.label}
        </Text>
        <Text className="text-xs tabular-nums text-muted-foreground">{section.items.length}</Text>
        {section.shipped ? <Badge variant="info">Shipped</Badge> : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add item to ${section.label}`}
        onPress={onAdd}
        className="h-8 w-8 items-center justify-center rounded-lg"
        style={{ opacity: showAdd ? 1 : 0 }}
      >
        <PlusIcon size={14} className="text-muted-foreground" />
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
    <Row
      accessibilityLabel={`${item.title}, ${KIND[item.kind].label}, ${status.label}`}
      accessibilityState={{ selected }}
      onPress={onOpen}
      onLongPress={Platform.OS === "web" ? undefined : () => {}}
      className={`items-start rounded-[10px] py-2 pl-2.5 pr-1 ${selected ? "bg-primary/15" : ""}`}
    >
      <Row.Media>
        <SymbolView name={IconNames[status.icon]} size={16} tintColor={statusColor(theme, item.status)} />
      </Row.Media>
      <Row.Content>
        <Row.Title
          numberOfLines={2}
          className={closed ? "text-muted-foreground" : undefined}
          style={item.status === "dropped" ? { textDecorationLine: "line-through" } : undefined}
        >
          {item.title}
        </Row.Title>
        {meta.length > 0 || item.links.length > 0 ? (
          <View className="flex-row flex-wrap items-center gap-x-1">
            {meta.map((part, index) => (
              <Text key={`${part}:${index}`} className="text-xs leading-4 tabular-nums text-muted-foreground">
                {index > 0 ? "· " : ""}
                {part}
              </Text>
            ))}
            {item.links.length > 0 ? (
              <View className="ml-1 flex-row items-center gap-0.5">
                <SymbolView name={IconNames.link} size={11} tintColor={theme.textSecondary} />
                <Text className="text-xs leading-4 tabular-nums text-muted-foreground">{item.links.length}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Row.Content>
      <Row.Actions>
        <SymbolView name={IconNames[KIND[item.kind].icon]} size={13} tintColor={kindColor(theme, item.kind)} />
      </Row.Actions>
    </Row>
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
      className="mx-2.5 my-1.5 gap-2 rounded-xl border border-border bg-card p-2"
    >
      <Input
        value={title}
        onChangeText={setTitle}
        autoFocus
        variant="filled"
        placeholder={placeholder}
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={() => void submit(false)}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === "Escape") onClose();
        }}
      />
      <View className="flex-row flex-wrap items-center justify-between gap-1.5">
        <View accessibilityRole="radiogroup" className="flex-row gap-0.5">
          {(["feature", "fix"] as RoadmapKind[]).map((k) => (
            <Chip
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
              selected={kind === k}
              size="sm"
              onPress={() => setKind(k)}
              start={
                <SymbolView
                  name={IconNames[KIND[k].icon]}
                  size={12}
                  tintColor={kind === k ? kindColor(theme, k) : theme.textSecondary}
                />
              }>
              <Chip.Label>{KIND[k].label}</Chip.Label>
            </Chip>
          ))}
        </View>
        <View className="flex-row items-center gap-0.5">
          <Action label="Cancel" onPress={onClose} />
          <Action label={busy ? "Adding…" : "Add"} emphasis disabled={!title.trim() || busy} onPress={() => void submit(true)} />
        </View>
      </View>
    </Animated.View>
  );
}

function EmptyRoadmap({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  return (
    <EmptyState
      icon="layers"
      title="Plan what's next"
      body="Add the Features and Fixes you want to build. Group them by Category, then start a Session when you're ready."
      action={
        <View className="flex-row flex-wrap justify-center gap-1.5">
          <Action label="New item" emphasis onPress={onNew} />
          <Action label="Import GitHub issue" onPress={onImport} />
        </View>
      }
    />
  );
}

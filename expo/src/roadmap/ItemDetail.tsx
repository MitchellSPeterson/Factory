import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Markdown from "react-native-markdown-display";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion, ZoomIn } from "react-native-reanimated";
import { Button } from "panelui-native/components/button";
import { Checkbox } from "panelui-native/components/checkbox";
import { Chip as FilterChip } from "panelui-native/components/chip";
import { Dialog } from "panelui-native/components/dialog";
import { Item } from "panelui-native/components/item";
import { Progress as Bar } from "panelui-native/components/progress";
import { Spinner } from "panelui-native/components/spinner";
import { Textarea } from "panelui-native/components/textarea";
import { ChevronDownIcon, ChevronRightIcon, XIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";
import { useMutation, useQuery, useAction } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";
import { Action, Notice } from "@/chats/ui";
import { IconButton, IconNames, type IconName } from "@/components/icon-button";
import { SendToBuildDialog } from "@/build/SendToBuildDialog";
import { Popover } from "./Popover";
import {
  EASE_OUT,
  KIND,
  LINK_STATE,
  MOTION_MS,
  STATUS,
  isClosed,
  kindColor,
  linkStateColor,
  statusColor,
} from "./meta";
import {
  ROADMAP_STATUSES,
  type GithubLink,
  type Requirement,
  type RoadmapItemPatch,
  type RoadmapKind,
} from "../../../shared/roadmap";

const LAYOUT = LinearTransition.duration(MOTION_MS).easing(EASE_OUT);
const web = Platform.OS === "web";
const noOutline = web ? ({ outlineStyle: "none" } as object) : null;

export function ItemDetail({ itemId, onClose }: { itemId: Id<"roadmapItems">; onClose: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const item = useQuery(api.roadmap.getItem, { itemId });
  const board = useQuery(api.roadmap.get, item ? { projectId: item.projectId } : "skip");
  const sessions = useQuery(api.sessions.list);
  const builds = useQuery(api.builds.list, item ? { projectId: item.projectId } : "skip");
  const updateItem = useMutation(api.roadmap.updateItem);
  const removeItem = useMutation(api.roadmap.removeItem);
  const removeLink = useMutation(api.roadmap.removeLink);
  const addLink = useAction(api.roadmap.addLink);
  const refreshLinks = useAction(api.roadmap.refreshLinks);

  const [title, setTitle] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [buildDialog, setBuildDialog] = useState(false);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDesc(item.description);
  }, [item?._id]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const it of board?.items ?? []) for (const tag of it.tags) set.add(tag);
    return [...set].sort();
  }, [board?.items]);

  if (item === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner label="Loading item" />
      </View>
    );
  }
  if (item === null) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-sm text-muted-foreground">This item was deleted.</Text>
      </View>
    );
  }
  const current = item;

  async function patch(p: RoadmapItemPatch) {
    try {
      await updateItem({ itemId, patch: p });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that change.");
    }
  }
  function saveTitle() {
    const next = title.trim();
    if (next && next !== current.title) void patch({ title: next });
    else setTitle(current.title);
  }
  function saveDesc() {
    setEditingDesc(false);
    if (desc !== current.description) void patch({ description: desc });
  }
  async function refresh() {
    setRefreshing(true);
    try {
      await refreshLinks({ itemId });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh GitHub links.");
    } finally {
      setRefreshing(false);
    }
  }
  async function doDelete() {
    setConfirmDelete(false);
    await removeItem({ itemId });
    onClose();
  }

  const categoryName = board?.categories.find((c) => c._id === item.categoryId)?.name ?? "";
  const releaseName = board?.releases.find((r) => r._id === item.releaseId)?.name ?? "";
  const allRequirementsDone = item.requirements.length > 0 && item.requirements.every((r) => r.done);
  const prMerged = item.links.some((l) => l.kind === "pr" && l.state === "merged");
  const suggestDone = !isClosed(item.status) && (allRequirementsDone || prMerged);
  const linkedSessions = (sessions ?? []).filter((row) => item.sessionIds.includes(row.session._id));
  const existingBuild = (builds ?? []).find((b) => b.roadmapItemId === item._id && b.status !== "stopped");

  return (
    <ScrollView className="flex-1" contentContainerClassName="w-full max-w-[760px] self-center px-5 pb-16 pt-3" keyboardShouldPersistTaps="handled">
      <View className="-ml-2 flex-row items-center justify-between gap-2">
        <Popover
          align="left"
          items={(["feature", "fix"] as RoadmapKind[]).map((k) => ({
            label: KIND[k].label,
            icon: KIND[k].icon,
            iconColor: kindColor(theme, k),
            selected: item.kind === k,
            onPress: () => void patch({ kind: k }),
          }))}
        >
          {(open) => (
            <Chip
              icon={KIND[item.kind].icon}
              iconColor={kindColor(theme, item.kind)}
              label={KIND[item.kind].label}
              onPress={open}
              accessibilityLabel={`Kind, ${KIND[item.kind].label}`}
            />
          )}
        </Popover>
        <View className="flex-row items-center gap-1">
          <Action
            label="Start Session"
            emphasis
            onPress={() => router.push({ pathname: "/chats", params: { new: "1", roadmapItem: item._id } })}
          />
          <Action
            label={existingBuild ? "Open Build" : "Send to Build"}
            onPress={() =>
              existingBuild
                ? router.push({ pathname: "/build", params: { build: existingBuild._id } })
                : setBuildDialog(true)
            }
          />
          <Popover
            items={[
              ...(item.links.length > 0
                ? [{ label: "Refresh GitHub links", icon: "reload" as IconName, onPress: () => void refresh() }]
                : []),
              { label: "Delete item", icon: "trash" as IconName, danger: true, onPress: () => setConfirmDelete(true) },
            ]}
          >
            {(open, isOpen) => (
              <View className={isOpen ? "rounded-xl bg-muted" : undefined}>
                <IconButton
                  icon="more"
                  accessibilityLabel="Item actions"
                  onPress={open}
                  style={{ backgroundColor: "transparent" }}
                />
              </View>
            )}
          </Popover>
        </View>
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        onBlur={saveTitle}
        onSubmitEditing={saveTitle}
        // Web renders multiline as a fixed two-row textarea; one line reads right there.
        multiline={!web}
        submitBehavior="blurAndSubmit"
        accessibilityLabel="Title"
        className="mt-1 py-2 text-[26px] font-bold leading-[33px] tracking-tight text-foreground"
        style={noOutline}
      />

      {error ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION_MS)}>
          <Notice text={error} error />
        </Animated.View>
      ) : null}

      {suggestDone ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(MOTION_MS).easing(EASE_OUT)}
          exiting={reduced ? undefined : FadeOut.duration(140)}
          className="mt-2"
        >
          <View className="flex-row items-center gap-2 rounded-xl bg-primary/15 py-1 pl-3.5 pr-1">
            <SymbolView name={IconNames.done} size={18} tintColor={theme.accent} />
            <Text className="flex-1 text-[13px] leading-[19px] text-foreground">
              {allRequirementsDone ? "Every requirement is ticked." : "A linked pull request merged."} Mark this done?
            </Text>
            <Action label="Mark done" onPress={() => void patch({ status: "done" })} />
          </View>
        </Animated.View>
      ) : null}

      <Animated.View layout={reduced ? undefined : LAYOUT} className="mt-3 rounded-xl border border-border px-3">
        <Property icon="inProgress" label="Status">
          <Popover
            align="left"
            items={ROADMAP_STATUSES.map((s) => ({
              label: STATUS[s].label,
              icon: STATUS[s].icon,
              iconColor: statusColor(theme, s),
              selected: item.status === s,
              onPress: () => void patch({ status: s }),
            }))}
          >
            {(open) => (
              <Chip
                icon={STATUS[item.status].icon}
                iconColor={statusColor(theme, item.status)}
                label={STATUS[item.status].label}
                onPress={open}
                accessibilityLabel={`Status, ${STATUS[item.status].label}`}
              />
            )}
          </Popover>
        </Property>
        <Property icon="category" label="Category">
          <ComboField
            value={categoryName}
            options={(board?.categories ?? []).map((c) => c.name)}
            placeholder="Add category"
            onSave={(name) => void patch({ category: name || null })}
          />
        </Property>
        <Property icon="release" label="Release">
          <ComboField
            value={releaseName}
            options={(board?.releases ?? []).map((r) => r.name)}
            placeholder="Add release"
            onSave={(name) => void patch({ release: name || null })}
          />
        </Property>
        <Property icon="tag" label="Tags" last>
          <TagsField tags={item.tags} options={allTags} onChange={(tags) => void patch({ tags })} />
        </Property>
      </Animated.View>

      <Section title="Description">
        {editingDesc ? (
          <Textarea
            value={desc}
            onChangeText={setDesc}
            onBlur={saveDesc}
            autoFocus
            rows={5}
            placeholder="What is this, and why does it matter? Markdown works."
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit description"
            onPress={() => setEditingDesc(true)}
            className="-mx-2 rounded-lg px-2 py-1.5 active:bg-muted"
          >
            {item.description.trim() ? (
              <Markdown
                style={{
                  body: { color: theme.text, fontSize: 15, lineHeight: 23 },
                  code_inline: { backgroundColor: theme.backgroundElement, color: theme.text, fontFamily: Fonts.mono, fontSize: 13 },
                  fence: { backgroundColor: theme.sidebar, color: theme.text, borderColor: theme.line, fontFamily: Fonts.mono, fontSize: 12 },
                  link: { color: theme.accent },
                }}
              >
                {item.description}
              </Markdown>
            ) : (
              <Text className="text-[15px] text-muted-foreground">Add a description…</Text>
            )}
          </Pressable>
        )}
      </Section>

      <Section
        title="Requirements"
        aside={
          item.requirements.length > 0 ? (
            <Text className="text-xs tabular-nums text-muted-foreground">
              {item.requirements.filter((r) => r.done).length} of {item.requirements.length}
            </Text>
          ) : null
        }
      >
        {item.requirements.length > 0 ? <Progress requirements={item.requirements} /> : null}
        <Requirements requirements={item.requirements} onChange={(requirements) => void patch({ requirements })} />
      </Section>

      <Section
        title="GitHub"
        aside={
          item.links.length > 0 ? (
            <IconButton
              icon="reload"
              accessibilityLabel="Refresh GitHub links"
              disabled={refreshing}
              onPress={() => void refresh()}
              style={{ backgroundColor: "transparent" }}
            />
          ) : null
        }
      >
        {item.links.map((link) => (
          <LinkRow key={link.url} link={link} onRemove={() => void removeLink({ itemId, url: link.url })} />
        ))}
        <GhostInput
          placeholder="Link an issue or pull request (#123 or URL)"
          onSubmit={async (ref) => {
            try {
              await addLink({ itemId, ref });
              setError("");
              return true;
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not add that link.");
              return false;
            }
          }}
        />
      </Section>

      {linkedSessions.length > 0 ? (
        <Section title="Sessions">
          {linkedSessions.map((row) => (
            <Item
              key={row.session._id}
              accessibilityRole="link"
              className="-mx-2"
              onPress={() => router.push({ pathname: "/chats", params: { session: row.session._id } })}>
              <Item.Media>
                <SymbolView name={IconNames.sessions} size={14} tintColor={theme.textSecondary} />
              </Item.Media>
              <Item.Content>
                <Item.Title numberOfLines={1}>{row.session.title}</Item.Title>
              </Item.Content>
              <Item.Actions>
                <ChevronRightIcon size={14} className="text-muted-foreground" />
              </Item.Actions>
            </Item>
          ))}
        </Section>
      ) : null}

      <ConfirmDelete
        visible={confirmDelete}
        title={item.title}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
      />
      <SendToBuildDialog
        visible={buildDialog}
        roadmapItemId={item._id}
        onClose={() => setBuildDialog(false)}
        onCreated={(id) => {
          setBuildDialog(false);
          router.push({ pathname: "/build", params: { build: id } });
        }}
      />
    </ScrollView>
  );
}

function Chip({
  icon,
  iconColor,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  iconColor: string;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <FilterChip accessibilityLabel={accessibilityLabel} onPress={onPress} variant="outline" size="sm" start={<SymbolView name={IconNames[icon]} size={14} tintColor={iconColor} />}>
      <FilterChip.Label>{label}</FilterChip.Label>
      <ChevronDownIcon size={12} />
    </FilterChip>
  );
}

function Property({ icon, label, last, children }: { icon: IconName; label: string; last?: boolean; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View className={`min-h-11 flex-row items-start gap-3 py-1.5 ${last ? "" : "border-b border-border"}`}>
      <View className="h-8 w-[104px] flex-row items-center gap-2">
        <SymbolView name={IconNames[icon]} size={13} tintColor={theme.textSecondary} />
        <Text className="text-[13px] text-muted-foreground">{label}</Text>
      </View>
      <View className="min-h-8 min-w-0 flex-1 justify-center">{children}</View>
    </View>
  );
}

/** Type to find or create. Existing names appear as you type; Enter or blur saves; empty clears. */
function ComboField({
  value,
  options,
  placeholder,
  onSave,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onSave: (name: string) => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [draft, setDraftState] = useState<string | null>(null);
  // Mirrors draft so the delayed blur sees a suggestion tap that already committed.
  const latest = useRef<string | null>(null);
  const setDraft = (next: string | null) => {
    latest.current = next;
    setDraftState(next);
  };
  const editing = draft !== null;
  const query = (draft ?? "").trim().toLowerCase();
  const matches = options.filter((o) => o !== value && o.toLowerCase().includes(query)).slice(0, 6);
  const creating = query !== "" && !options.some((o) => o.toLowerCase() === query);

  function commit(name: string) {
    setDraft(null);
    if (name.trim() !== value) onSave(name.trim());
  }

  return (
    <View className="flex-1">
      <TextInput
        value={editing ? draft : value}
        onFocus={() => setDraft(value)}
        onChangeText={setDraft}
        // Delay so a tap on a suggestion lands before blur hides it.
        onBlur={() => setTimeout(() => latest.current !== null && commit(latest.current), 150)}
        onSubmitEditing={() => commit(draft ?? "")}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        className={`h-8 rounded-lg border px-2 text-[13px] text-foreground ${editing ? "border-input bg-background" : "border-transparent"}`}
        style={noOutline}
      />
      {editing && (matches.length > 0 || creating) ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(120)}
          className="mt-1 rounded-[10px] border border-border bg-card p-1"
        >
          {matches.map((name) => (
            <Suggestion key={name} label={name} onPress={() => commit(name)} />
          ))}
          {creating ? <Suggestion label={`Create “${(draft ?? "").trim()}”`} icon="add" onPress={() => commit(draft ?? "")} /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Suggestion({ label, icon, onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      className="min-h-[34px] flex-row items-center gap-2 rounded-md px-2 active:bg-muted"
    >
      {icon ? <SymbolView name={IconNames[icon]} size={12} tintColor={theme.textSecondary} /> : null}
      <Text numberOfLines={1} className="text-[13px] text-foreground">
        {label}
      </Text>
    </Pressable>
  );
}

function TagsField({ tags, options, onChange }: { tags: string[]; options: string[]; onChange: (tags: string[]) => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const query = draft.trim().toLowerCase();
  const matches = options.filter((t) => !tags.includes(t) && t.toLowerCase().includes(query)).slice(0, 6);

  function add(tag: string) {
    const next = tag.trim();
    setDraft("");
    if (next && !tags.includes(next)) onChange([...tags, next]);
  }

  return (
    <View className="flex-1">
      <View className="min-h-8 flex-row flex-wrap items-center gap-1.5 pl-1">
        {tags.map((tag) => (
          <Animated.View key={tag} entering={reduced ? undefined : ZoomIn.duration(140)} exiting={reduced ? undefined : FadeOut.duration(100)}>
            <FilterChip size="sm" onClose={() => onChange(tags.filter((t) => t !== tag))} closeLabel={`Remove tag ${tag}`}>
              {tag}
            </FilterChip>
          </Animated.View>
        ))}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onSubmitEditing={() => add(draft)}
          submitBehavior="submit"
          placeholder={tags.length ? "Add" : "Add tag"}
          placeholderTextColor={theme.textSecondary}
          className="h-7 min-w-20 flex-grow px-1 text-[13px] text-foreground"
          style={noOutline}
        />
      </View>
      {focused && matches.length > 0 ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(120)}
          className="mt-1 rounded-[10px] border border-border bg-card p-1"
        >
          {matches.map((tag) => (
            <Suggestion key={tag} label={tag} onPress={() => add(tag)} />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View layout={reduced ? undefined : LAYOUT} className="mt-7 gap-1.5">
      <View className="min-h-7 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
        {aside}
      </View>
      {children}
    </Animated.View>
  );
}

function Progress({ requirements }: { requirements: Requirement[] }) {
  const ratio = requirements.filter((r) => r.done).length / requirements.length;
  return <Bar value={ratio * 100} color={ratio === 1 ? "success" : "primary"} size="sm" className="mb-1" />;
}

function Requirements({ requirements, onChange }: { requirements: Requirement[]; onChange: (next: Requirement[]) => void }) {
  const reduced = useReducedMotion();
  return (
    <View>
      {requirements.map((req) => (
        <Animated.View
          key={req.id}
          layout={reduced ? undefined : LAYOUT}
          entering={reduced ? undefined : FadeIn.duration(MOTION_MS)}
          exiting={reduced ? undefined : FadeOut.duration(120)}
        >
          <RequirementRow
            req={req}
            onToggle={() => onChange(requirements.map((r) => (r.id === req.id ? { ...r, done: !r.done } : r)))}
            onEdit={(text) => onChange(requirements.map((r) => (r.id === req.id ? { ...r, text } : r)))}
            onDelete={() => onChange(requirements.filter((r) => r.id !== req.id))}
          />
        </Animated.View>
      ))}
      <GhostInput
        placeholder="Add a requirement"
        onSubmit={async (text) => {
          onChange([...requirements, { id: `${Date.now()}`, text, done: false }]);
          return true;
        }}
      />
    </View>
  );
}

function RequirementRow({
  req,
  onToggle,
  onEdit,
  onDelete,
}: {
  req: Requirement;
  onToggle: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  function save() {
    const text = (draft ?? "").trim();
    setDraft(null);
    if (text && text !== req.text) onEdit(text);
  }

  return (
    <View
      className={`-mx-2 min-h-[38px] flex-row items-center gap-2.5 rounded-lg pl-2 ${hover ? "bg-muted" : ""}`}
      {...(web ? { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } : {})}
    >
      <Checkbox checked={req.done} onCheckedChange={() => onToggle()} />
      {draft !== null ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={save}
          onSubmitEditing={save}
          autoFocus
          className="h-9 flex-1 text-sm text-foreground"
          style={noOutline}
        />
      ) : (
        <Pressable className="flex-1 py-2" onPress={() => setDraft(req.text)} accessibilityHint="Edit requirement">
          <Text
            className={`text-sm leading-5 ${req.done ? "text-muted-foreground line-through" : "text-foreground"}`}
          >
            {req.text}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${req.text}`}
        onPress={onDelete}
        className="h-9 w-9 items-center justify-center"
        style={{ opacity: hover || !web ? 1 : 0 }}
      >
        <XIcon size={14} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}

function LinkRow({ link, onRemove }: { link: GithubLink; onRemove: () => void }) {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  const color = linkStateColor(theme, link.state);
  const stateClass = link.state === "merged" ? "text-primary" : link.state === "open" ? "text-success" : "text-muted-foreground";
  return (
    <View
      className={`-mx-2 min-h-11 flex-row items-center gap-2.5 rounded-lg px-2 ${hover ? "bg-muted" : ""}`}
      {...(web ? { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } : {})}
    >
      <Pressable accessibilityRole="link" className="min-w-0 flex-1 flex-row items-center gap-2.5 py-1.5" onPress={() => void Linking.openURL(link.url)}>
        <SymbolView name={link.kind === "pr" ? IconNames.pullRequest : IconNames.issue} size={14} tintColor={color} />
        <View className="min-w-0 flex-1 gap-px">
          <Text numberOfLines={1} className="text-sm text-foreground">
            {link.title ?? `${link.repo}#${link.number}`}
          </Text>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {link.repo}#{link.number}
            {link.state ? <Text className={stateClass}> · {LINK_STATE[link.state]}</Text> : null}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${link.repo}#${link.number}`}
        onPress={onRemove}
        className="h-9 w-9 items-center justify-center"
        style={{ opacity: hover || !web ? 1 : 0 }}
      >
        <XIcon size={14} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}

/** A quiet "+ Add …" row that becomes an input. onSubmit resolves true to clear it. */
function GhostInput({ placeholder, onSubmit }: { placeholder: string; onSubmit: (text: string) => Promise<boolean> }) {
  const theme = useTheme();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    if (await onSubmit(value)) setText("");
    setBusy(false);
  }
  return (
    <View className="min-h-[38px] flex-row items-center gap-2.5">
      {busy ? <Spinner size="sm" /> : <SymbolView name={IconNames.add} size={14} tintColor={theme.textSecondary} />}
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => void submit()}
        submitBehavior="submit"
        editable={!busy}
        autoCapitalize="sentences"
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        className="h-9 flex-1 text-sm text-foreground"
        style={noOutline}
      />
    </View>
  );
}

function ConfirmDelete({
  visible,
  title,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Content className="w-full max-w-[380px] gap-2">
        <Dialog.Title>Delete “{title}”?</Dialog.Title>
        <Dialog.Description>
          This removes the item and its Requirements. Linked Sessions and GitHub issues stay.
        </Dialog.Description>
        <Dialog.Footer>
          <Button variant="ghost" onPress={onCancel}>Cancel</Button>
          <Button variant="destructive" onPress={onConfirm}>Delete</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}


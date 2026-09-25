import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SymbolView } from "expo-symbols";
import Markdown from "react-native-markdown-display";
import { useRouter } from "expo-router";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { useMutation, useQuery, useAction } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";
import { Action, Notice } from "@/chats/ui";
import { IconButton, IconNames, type IconName } from "@/components/icon-button";
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
      <View style={styles.center}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }
  if (item === null) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>This item was deleted.</Text>
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

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
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
        <View style={styles.topBarEnd}>
          <Action
            label="Start Session"
            emphasis
            onPress={() => router.push({ pathname: "/chats", params: { new: "1", roadmapItem: item._id } })}
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
              <IconButton
                icon="more"
                accessibilityLabel="Item actions"
                onPress={open}
                style={{ backgroundColor: isOpen ? theme.subtleHover : "transparent" }}
              />
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
        style={[styles.title, { color: theme.text }, noOutline]}
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
          style={[styles.banner, { backgroundColor: theme.backgroundSelected }]}
        >
          <SymbolView name={IconNames.done} size={18} tintColor={theme.accent} />
          <Text style={[styles.bannerText, { color: theme.text }]}>
            {allRequirementsDone ? "Every requirement is ticked." : "A linked pull request merged."} Mark this done?
          </Text>
          <Action label="Mark done" onPress={() => void patch({ status: "done" })} />
        </Animated.View>
      ) : null}

      <Animated.View layout={reduced ? undefined : LAYOUT} style={[styles.props, { borderColor: theme.line }]}>
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
          <TextInput
            value={desc}
            onChangeText={setDesc}
            onBlur={saveDesc}
            multiline
            autoFocus
            placeholder="What is this, and why does it matter? Markdown works."
            placeholderTextColor={theme.textSecondary}
            style={[styles.descInput, { color: theme.text, borderColor: theme.lineStrong }, noOutline]}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit description"
            onPress={() => setEditingDesc(true)}
            style={({ hovered }: { hovered?: boolean }) => [styles.descView, hovered && { backgroundColor: theme.subtleHover }]}
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
              <Text style={{ color: theme.textSecondary, fontSize: 15 }}>Add a description…</Text>
            )}
          </Pressable>
        )}
      </Section>

      <Section
        title="Requirements"
        aside={
          item.requirements.length > 0 ? (
            <Text style={[styles.aside, { color: theme.textSecondary }]}>
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
            <Pressable
              key={row.session._id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: "/chats", params: { session: row.session._id } })}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.listRow,
                (pressed || hovered) && { backgroundColor: theme.subtleHover },
              ]}
            >
              <SymbolView name={IconNames.sessions} size={14} tintColor={theme.textSecondary} />
              <Text numberOfLines={1} style={[styles.listRowText, { color: theme.text }]}>
                {row.session.title}
              </Text>
              <SymbolView name={IconNames.chevronRight} size={11} tintColor={theme.textSecondary} />
            </Pressable>
          ))}
        </Section>
      ) : null}

      <ConfirmDelete
        visible={confirmDelete}
        title={item.title}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
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
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.chip,
        (pressed || hovered) && { backgroundColor: theme.subtleHover },
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <SymbolView name={IconNames[icon]} size={14} tintColor={iconColor} />
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}>{label}</Text>
      <SymbolView name={IconNames.chevronDown} size={10} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

function Property({ icon, label, last, children }: { icon: IconName; label: string; last?: boolean; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.property, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.line }]}>
      <View style={styles.propertyLabel}>
        <SymbolView name={IconNames[icon]} size={13} tintColor={theme.textSecondary} />
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{label}</Text>
      </View>
      <View style={styles.propertyValue}>{children}</View>
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
    <View style={styles.combo}>
      <TextInput
        value={editing ? draft : value}
        onFocus={() => setDraft(value)}
        onChangeText={setDraft}
        // Delay so a tap on a suggestion lands before blur hides it.
        onBlur={() => setTimeout(() => latest.current !== null && commit(latest.current), 150)}
        onSubmitEditing={() => commit(draft ?? "")}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.comboInput,
          { color: theme.text, backgroundColor: editing ? theme.background : "transparent" },
          editing && { borderColor: theme.lineStrong },
          noOutline,
        ]}
      />
      {editing && (matches.length > 0 || creating) ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(120)}
          style={[styles.suggestions, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
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
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.suggestion,
        (pressed || hovered) && { backgroundColor: theme.subtleHover },
      ]}
    >
      {icon ? <SymbolView name={IconNames[icon]} size={12} tintColor={theme.textSecondary} /> : null}
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13 }}>
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
    <View style={styles.combo}>
      <View style={styles.tags}>
        {tags.map((tag) => (
          <Animated.View key={tag} entering={reduced ? undefined : ZoomIn.duration(140)} exiting={reduced ? undefined : FadeOut.duration(100)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${tag}`}
              onPress={() => onChange(tags.filter((t) => t !== tag))}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.tag,
                { backgroundColor: hovered ? theme.lineStrong : theme.line },
              ]}
            >
              <Text style={{ color: theme.text, fontSize: 12 }}>{tag}</Text>
              <SymbolView name={IconNames.close} size={9} tintColor={theme.textSecondary} />
            </Pressable>
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
          style={[styles.tagInput, { color: theme.text }, noOutline]}
        />
      </View>
      {focused && matches.length > 0 ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(120)}
          style={[styles.suggestions, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
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
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View layout={reduced ? undefined : LAYOUT} style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        {aside}
      </View>
      {children}
    </Animated.View>
  );
}

function Progress({ requirements }: { requirements: Requirement[] }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const ratio = requirements.filter((r) => r.done).length / requirements.length;
  const fill = useAnimatedStyle(
    () => ({ width: withTiming(`${ratio * 100}%`, { duration: reduced ? 0 : 320, easing: EASE_OUT }) }),
    [ratio, reduced],
  );
  return (
    <View style={[styles.progress, { backgroundColor: theme.line }]}>
      <Animated.View style={[styles.progressFill, { backgroundColor: ratio === 1 ? theme.success : theme.accent }, fill]} />
    </View>
  );
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
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const scale = useSharedValue(1);
  const box = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function toggle() {
    if (!reduced) scale.value = withSequence(withTiming(0.8, { duration: 70 }), withSpring(1, { damping: 9, stiffness: 320 }));
    onToggle();
  }
  function save() {
    const text = (draft ?? "").trim();
    setDraft(null);
    if (text && text !== req.text) onEdit(text);
  }

  return (
    <View
      style={[styles.reqRow, hover && { backgroundColor: theme.subtleHover }]}
      {...(web ? { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } : {})}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: req.done }}
        accessibilityLabel={req.text}
        onPress={toggle}
        hitSlop={8}
      >
        <Animated.View
          style={[
            styles.checkbox,
            { borderColor: req.done ? theme.accent : theme.lineStrong, backgroundColor: req.done ? theme.accent : "transparent" },
            box,
          ]}
        >
          {req.done ? (
            <Animated.View entering={reduced ? undefined : ZoomIn.duration(160).easing(EASE_OUT)}>
              <SymbolView name={IconNames.check} size={11} tintColor="#ffffff" />
            </Animated.View>
          ) : null}
        </Animated.View>
      </Pressable>
      {draft !== null ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={save}
          onSubmitEditing={save}
          autoFocus
          style={[styles.reqInput, { color: theme.text }, noOutline]}
        />
      ) : (
        <Pressable style={styles.reqTextWrap} onPress={() => setDraft(req.text)} accessibilityHint="Edit requirement">
          <Text
            style={[
              styles.reqText,
              { color: req.done ? theme.textSecondary : theme.text },
              req.done && { textDecorationLine: "line-through" },
            ]}
          >
            {req.text}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${req.text}`}
        onPress={onDelete}
        style={[styles.rowIcon, { opacity: hover || !web ? 1 : 0 }]}
      >
        <SymbolView name={IconNames.close} size={12} tintColor={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

function LinkRow({ link, onRemove }: { link: GithubLink; onRemove: () => void }) {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  const color = linkStateColor(theme, link.state);
  return (
    <View
      style={[styles.listRow, hover && { backgroundColor: theme.subtleHover }]}
      {...(web ? { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } : {})}
    >
      <Pressable accessibilityRole="link" style={styles.linkMain} onPress={() => void Linking.openURL(link.url)}>
        <SymbolView name={link.kind === "pr" ? IconNames.pullRequest : IconNames.issue} size={14} tintColor={color} />
        <View style={styles.linkCopy}>
          <Text numberOfLines={1} style={[styles.listRowText, { color: theme.text }]}>
            {link.title ?? `${link.repo}#${link.number}`}
          </Text>
          <Text numberOfLines={1} style={{ color: theme.textSecondary, fontSize: 12 }}>
            {link.repo}#{link.number}
            {link.state ? (
              <Text style={{ color }}> · {LINK_STATE[link.state]}</Text>
            ) : null}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${link.repo}#${link.number}`}
        onPress={onRemove}
        style={[styles.rowIcon, { opacity: hover || !web ? 1 : 0 }]}
      >
        <SymbolView name={IconNames.close} size={12} tintColor={theme.textSecondary} />
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
    <View style={styles.ghost}>
      {busy ? (
        <ActivityIndicator size="small" color={theme.textSecondary} style={styles.ghostIcon} />
      ) : (
        <SymbolView name={IconNames.add} size={14} tintColor={theme.textSecondary} style={styles.ghostIcon} />
      )}
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => void submit()}
        submitBehavior="submit"
        editable={!busy}
        autoCapitalize="sentences"
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.ghostInput, { color: theme.text }, noOutline]}
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
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.overlay}>
        <Pressable accessibilityLabel="Dismiss" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <Animated.View
          entering={reduced ? undefined : ZoomIn.duration(200).easing(EASE_OUT)}
          accessibilityViewIsModal
          style={[styles.dialog, { backgroundColor: theme.backgroundElement, borderColor: theme.line }]}
        >
          <Text style={[styles.dialogTitle, { color: theme.text }]}>Delete “{title}”?</Text>
          <Text style={[styles.dialogBody, { color: theme.textSecondary }]}>
            This removes the item and its Requirements. Linked Sessions and GitHub issues stay.
          </Text>
          <View style={styles.dialogActions}>
            <Action label="Cancel" onPress={onCancel} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete item"
              onPress={onConfirm}
              style={({ pressed }) => [styles.dialogDelete, { backgroundColor: pressed ? "#d63f38" : theme.danger }]}
            >
              <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "600" }}>Delete</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 64, maxWidth: 760, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginLeft: -8 },
  topBarEnd: { flexDirection: "row", alignItems: "center", gap: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderCurve: "continuous",
    alignSelf: "flex-start",
  },
  title: { fontSize: 26, lineHeight: 33, fontWeight: "700", letterSpacing: -0.4, paddingVertical: 8, marginTop: 4 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
    marginTop: 8,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 19 },
  props: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: "continuous",
    paddingHorizontal: 12,
  },
  property: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 6, minHeight: 44 },
  propertyLabel: { flexDirection: "row", alignItems: "center", gap: 8, width: 104, height: 32 },
  propertyValue: { flex: 1, minWidth: 0, justifyContent: "center", minHeight: 32 },
  combo: { flex: 1 },
  comboInput: {
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "transparent",
    fontSize: 13,
  },
  suggestions: {
    marginTop: 4,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    borderCurve: "continuous",
    boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderCurve: "continuous",
  },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, minHeight: 32, paddingLeft: 4 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderCurve: "continuous",
  },
  tagInput: { flexGrow: 1, minWidth: 80, height: 28, paddingHorizontal: 4, fontSize: 13 },
  section: { marginTop: 28, gap: 6 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
  sectionTitle: { fontSize: 14, fontWeight: "600" },
  aside: { fontSize: 12, fontVariant: ["tabular-nums"] },
  descView: { marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderCurve: "continuous" },
  descInput: {
    minHeight: 120,
    marginHorizontal: -8,
    padding: 8,
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: 1,
    fontSize: 15,
    lineHeight: 23,
    textAlignVertical: "top",
  },
  progress: { height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  progressFill: { height: 4, borderRadius: 2 },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 38,
    marginHorizontal: -8,
    paddingLeft: 8,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderCurve: "continuous",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  reqTextWrap: { flex: 1, paddingVertical: 8 },
  reqText: { fontSize: 14, lineHeight: 20 },
  reqInput: { flex: 1, fontSize: 14, height: 36 },
  rowIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    marginHorizontal: -8,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  listRowText: { flex: 1, fontSize: 14 },
  linkMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  linkCopy: { flex: 1, minWidth: 0, gap: 1 },
  ghost: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 38 },
  ghostIcon: { width: 18 },
  ghostInput: { flex: 1, fontSize: 14, height: 36 },
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "center", padding: 16 },
  dialog: {
    width: 380,
    maxWidth: "100%",
    alignSelf: "center",
    padding: 20,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: "continuous",
    boxShadow: "0 20px 48px rgba(0,0,0,0.3)",
  },
  dialogTitle: { fontSize: 17, fontWeight: "600" },
  dialogBody: { fontSize: 13, lineHeight: 20 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 10, gap: 6 },
  dialogDelete: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
});


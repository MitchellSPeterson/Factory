import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { api, type Doc } from '@/lib/api';
import { useQuery } from '@/lib/factory';
import { useProjectScope } from '@/lib/project-scope-context';

type Notice = { key: string; title: string; body: string; tone: 'success' | 'danger' | 'accent'; href: string };

const SHOW_MS = 5000;
const BUILD_NOTICE = {
  waiting: { title: 'Build needs you', tone: 'accent' },
  paused: { title: 'Build paused', tone: 'danger' },
  done: { title: 'Build done', tone: 'success' },
} as const;

/** Calls `notify` when a row's status changes, never for the first snapshot. */
function useTransitions<T extends { _id: string }>(
  rows: T[] | undefined,
  status: (row: T) => string,
  notify: (row: T, from: string, to: string) => void,
) {
  const prev = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!rows) return;
    const next = new Map(rows.map((row) => [row._id, status(row)]));
    if (prev.current) {
      for (const row of rows) {
        const from = prev.current.get(row._id);
        const to = next.get(row._id)!;
        if (from && from !== to) notify(row, from, to);
      }
    }
    prev.current = next;
  });
}

function BuildWatcher({ projectId, push }: { projectId: string; push: (n: Notice) => void }) {
  const builds = useQuery(api.builds.list, { projectId });
  useTransitions(builds, (b: Doc<'builds'>) => b.status, (b, _from, to) => {
    const meta = BUILD_NOTICE[to as keyof typeof BUILD_NOTICE];
    if (meta) push({ key: `${b._id}:${to}`, ...meta, body: b.title, href: `/build?build=${b._id}` });
  });
  return null;
}

/** Drops a banner from the top when a chat finishes or a Build needs you or finishes. */
export function NoticeBanner() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projects } = useProjectScope();
  const sessions = useQuery(api.sessions.list);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const rows = sessions?.map((row) => ({ ...row.session, _id: row.session._id as string }));
  // Build sessions (they have a cwd) are covered by their Build's own notices.
  useTransitions(rows, (s) => s.status, (s, from, to) => {
    if (s.cwd || !['running', 'queued'].includes(from) || ['running', 'queued'].includes(to)) return;
    const failed = to === 'failed';
    setNotice({
      key: `${s._id}:${to}`,
      title: failed ? 'Chat failed' : 'Chat done',
      body: s.title,
      tone: failed ? 'danger' : 'success',
      href: `/chats?session=${s._id}`,
    });
  });

  return (
    <>
      {(projects ?? []).map((p) => (
        <BuildWatcher key={p._id} projectId={p._id} push={setNotice} />
      ))}
      {notice && (
        <Animated.View
          key={notice.key}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, alignItems: 'center', zIndex: 100 }}>
          <Pressable
            accessibilityRole="alert"
            onPress={() => {
              setNotice(null);
              router.push(notice.href as never);
            }}
            style={{
              width: '100%',
              maxWidth: 520,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.line,
              backgroundColor: theme.backgroundElement,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme[notice.tone] }} />
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold">{notice.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {notice.body}
              </ThemedText>
            </View>
          </Pressable>
        </Animated.View>
      )}
    </>
  );
}

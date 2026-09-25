import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatList } from '@/chats/ChatList';
import { IconNames, type IconName } from '@/components/icon-button';
import { ProjectSwitcher } from '@/components/project-switcher';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDesktop } from '@/hooks/use-desktop';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import type { Id } from '@/lib/dataModel';
import { useMutation } from '@/lib/factory';

export function FactoryDrawer(props: DrawerContentComponentProps) {
  const theme = useTheme();
  const pathname = usePathname();
  if (useDesktop()) return <DesktopSidebar />;

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.scroll}
      style={{ backgroundColor: theme.sidebar }}>
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        <View style={styles.brand}>
          <ThemedText type="heading" style={styles.mark}>
            Factory
          </ThemedText>
        </View>
        <ProjectSwitcher />
        <ThemedText type="eyebrow" themeColor="textSecondary" style={styles.navLabel}>
          Work
        </ThemedText>
        <DrawerLink
          icon="sessions"
          label="Chats"
          focused={pathname === '/chats'}
          onPress={() => {
            router.push('/chats');
            props.navigation.closeDrawer();
          }}
        />
        <DrawerLink
          icon="git"
          label="Git"
          focused={pathname === '/git'}
          onPress={() => {
            router.push('/git');
            props.navigation.closeDrawer();
          }}
        />
        <DrawerLink
          icon="devices"
          label="Devices"
          focused={pathname === '/devices'}
          onPress={() => {
            router.push('/devices');
            props.navigation.closeDrawer();
          }}
        />
        <DrawerLink
          icon="terminal"
          label="Terminal"
          focused={pathname === '/terminal'}
          onPress={() => {
            router.push('/terminal');
            props.navigation.closeDrawer();
          }}
        />
        <View style={styles.bottom}>
          <DrawerLink
            icon="settings"
            label="Settings"
            focused={pathname.startsWith('/settings')}
            onPress={() => {
              router.push('/settings');
              props.navigation.closeDrawer();
            }}
          />
        </View>
      </SafeAreaView>
    </DrawerContentScrollView>
  );
}

/** Desktop web: always-on sidebar with nav and the chat list, ChatGPT/Codex style. */
function DesktopSidebar() {
  const theme = useTheme();
  const pathname = usePathname();
  const { session } = useGlobalSearchParams<{ session?: string }>();
  const removeSession = useMutation(api.sessions.remove);
  const searchRef = useRef<TextInput>(null);

  function goChats(params: { session?: string; new?: string }) {
    if (pathname === '/chats') router.setParams({ session: undefined, new: undefined, ...params });
    else router.navigate({ pathname: '/chats', params });
  }
  const newChat = () => goChats({ new: '1' });

  async function deleteChat(id: Id<'sessions'>, title: string) {
    if (!window.confirm(`Delete ${title}?\n\nThis deletes the conversation and its messages.`)) return;
    try {
      await removeSession({ sessionId: id });
      if (session === id) goChats({});
    } catch (e) {
      window.alert(`Could not delete chat. ${e instanceof Error ? e.message : 'Try again.'}`);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        newChat();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    // Capture phase: RN-web TextInputs stop keydown from bubbling.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <View style={[styles.desktop, { backgroundColor: theme.sidebar }]}>
      <View style={styles.brand}>
        <ThemedText type="heading" style={styles.mark}>
          Factory
        </ThemedText>
      </View>
      <DrawerLink
        icon="compose"
        label="New chat"
        shortcut="⇧⌘O"
        focused={pathname === '/chats' && !session}
        onPress={newChat}
      />
      <ProjectSwitcher />
      <View>
        <DrawerLink icon="git" label="Git" focused={pathname === '/git'} onPress={() => router.navigate('/git')} />
        <DrawerLink
          icon="devices"
          label="Devices"
          focused={pathname === '/devices'}
          onPress={() => router.navigate('/devices')}
        />
        <DrawerLink
          icon="terminal"
          label="Terminal"
          focused={pathname === '/terminal'}
          onPress={() => router.navigate('/terminal')}
        />
      </View>
      <View style={styles.chats}>
        <ChatList
          ref={searchRef}
          dense
          bottomInset={8}
          selectedId={pathname === '/chats' ? session : undefined}
          onOpen={(id) => goChats({ session: id })}
          onDelete={deleteChat}
        />
      </View>
      <DrawerLink
        icon="settings"
        label="Settings"
        focused={pathname.startsWith('/settings')}
        onPress={() => router.navigate('/settings')}
      />
    </View>
  );
}

export function DrawerLink({
  icon,
  label,
  shortcut,
  focused,
  onPress,
}: {
  icon: IconName;
  label: string;
  shortcut?: string;
  focused: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const desktop = useDesktop();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [
        desktop ? styles.itemDense : styles.item,
        focused
          ? { backgroundColor: theme.backgroundSelected }
          : (state as { hovered?: boolean }).hovered && { backgroundColor: theme.subtleHover },
        state.pressed && { opacity: 0.7 },
      ]}>
      <SymbolView
        name={IconNames[icon]}
        size={18}
        tintColor={focused ? theme.text : theme.textSecondary}
      />
      <ThemedText type="small" themeColor={focused ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
      {shortcut ? (
        <Text style={[styles.shortcut, { color: theme.textSecondary }]}>{shortcut}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: Spacing.three,
  },
  brand: {
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  mark: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 600,
    letterSpacing: -0.4,
  },
  navLabel: {
    paddingHorizontal: 10,
  },
  item: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  bottom: {
    marginTop: 'auto',
  },
  desktop: {
    flex: 1,
    padding: 10,
    gap: Spacing.two,
  },
  itemDense: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  shortcut: {
    marginLeft: 'auto',
    fontSize: 12,
  },
  chats: {
    flex: 1,
    minHeight: 0,
    paddingTop: Spacing.two,
  },
});

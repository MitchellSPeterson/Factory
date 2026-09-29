import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Item } from 'panelui-native/components/item';
import { Text } from 'panelui-native/primitives/text';
import { useCSSVariable } from 'uniwind';

import { IconNames, type IconName } from '@/components/icon-button';
import { ProjectSwitcher } from '@/components/project-switcher';
import { useDesktop } from '@/hooks/use-desktop';

export function FactoryDrawer(props: DrawerContentComponentProps) {
  const pathname = usePathname();
  if (useDesktop()) return <DesktopSidebar />;

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ flexGrow: 1 }}
      className="bg-surface">
      <SafeAreaView className="flex-1 gap-4 px-2.5 pb-2.5" edges={['left', 'right']}>
        <Text className="px-2 py-1.5 text-[22px] font-semibold leading-7 tracking-tight text-foreground">
          Factory
        </Text>
        <ProjectSwitcher />
        <Text className="px-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Work
        </Text>
        <View className="gap-0.5">
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
            icon="layers"
            label="Roadmap"
            focused={pathname === '/roadmap'}
            onPress={() => {
              router.push('/roadmap');
              props.navigation.closeDrawer();
            }}
          />
          <DrawerLink
            icon="loop"
            label="Build"
            focused={pathname === '/build'}
            onPress={() => {
              router.push('/build');
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
        </View>
        <View className="mt-auto">
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

/** Desktop web: always-on sidebar with nav; the chat list lives on the Chats page. */
function DesktopSidebar() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ new?: string }>();

  function goChats(params: { session?: string; new?: string }) {
    if (pathname === '/chats') router.setParams({ session: undefined, new: undefined, ...params });
    else router.navigate({ pathname: '/chats', params });
  }
  const newChat = () => goChats({ new: '1' });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        newChat();
      }
    }
    // Capture phase: RN-web TextInputs stop keydown from bubbling.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <View className="flex-1 gap-2 bg-surface p-2.5">
      <Text className="px-2 py-1.5 text-[22px] font-semibold leading-7 tracking-tight text-foreground">
        Factory
      </Text>
      <DrawerLink
        icon="compose"
        label="New chat"
        shortcut="⇧⌘O"
        focused={pathname === '/chats' && params.new === '1'}
        onPress={newChat}
      />
      <ProjectSwitcher />
      <View className="gap-0.5">
        <DrawerLink
          icon="sessions"
          label="Chats"
          focused={pathname === '/chats'}
          onPress={() => goChats({})}
        />
        <DrawerLink
          icon="layers"
          label="Roadmap"
          focused={pathname === '/roadmap'}
          onPress={() => router.navigate('/roadmap')}
        />
        <DrawerLink icon="loop" label="Build" focused={pathname === '/build'} onPress={() => router.navigate('/build')} />
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
      <View className="flex-1" />
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
  const desktop = useDesktop();
  const [foreground, muted] = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground',
  ]) as (string | undefined)[];
  return (
    <Item
      size={desktop ? 'sm' : 'default'}
      onPress={onPress}
      accessibilityLabel={label}
      className={focused ? 'bg-primary/15' : 'bg-transparent'}>
      <Item.Media>
        <SymbolView name={IconNames[icon]} size={18} tintColor={focused ? foreground : muted} />
      </Item.Media>
      <Item.Content>
        <Item.Title className={focused ? 'text-foreground' : 'text-muted-foreground'}>{label}</Item.Title>
      </Item.Content>
      {shortcut ? (
        <Item.Actions>
          <Text className="text-xs text-muted-foreground">{shortcut}</Text>
        </Item.Actions>
      ) : null}
    </Item>
  );
}

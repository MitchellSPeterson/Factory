// Anchored menu for Roadmap controls (⋯ menus, status picker).
import { useState, type ReactElement, type ReactNode } from "react";
import { SymbolView } from "expo-symbols";
import { Menu } from "panelui-native/components/menu";
import { CheckIcon } from "panelui-native/icons";

import { IconNames, type IconName } from "@/components/icon-button";

export type PopoverItem = {
  label: string;
  icon?: IconName;
  iconColor?: string;
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
};

/** Wraps a trigger; `children` receives an `open` function to call from the trigger's onPress. */
export function Popover({
  items,
  align = "right",
  children,
}: {
  items: PopoverItem[];
  align?: "left" | "right";
  children: (open: () => void, isOpen: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Menu.Trigger toggles on press after the child's onPress. The callback stays
  // so existing triggers still compile; opening is the menu's job.
  const trigger = children(() => undefined, open) as ReactElement<{ onPress?: (...args: unknown[]) => void }>;
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <Menu.Trigger>{trigger}</Menu.Trigger>
      <Menu.Content align={align === "right" ? "end" : "start"} minWidth={220}>
        {items.map((item) => (
          <Menu.Item
            key={item.label}
            variant={item.danger ? "destructive" : "default"}
            icon={
              item.icon ? (
                <SymbolView name={IconNames[item.icon]} size={16} tintColor={item.iconColor} />
              ) : undefined
            }
            trailing={item.selected ? <CheckIcon size={14} /> : undefined}
            onSelect={item.onPress}>
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu>
  );
}

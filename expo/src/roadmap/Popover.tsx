// Anchored menu for Roadmap controls (⋯ menus, status picker).
import { useState, type ReactNode } from "react";
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

// Menu.Trigger clones its child with the real open handler as `onPress`; forward it to the caller's button.
function Trigger({ render, isOpen, onPress }: { render: (open: () => void, isOpen: boolean) => ReactNode; isOpen: boolean; onPress?: () => void }) {
  return <>{render(onPress ?? (() => undefined), isOpen)}</>;
}

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
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <Menu.Trigger>
        <Trigger render={children} isOpen={open} />
      </Menu.Trigger>
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

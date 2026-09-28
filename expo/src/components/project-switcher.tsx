import { useEffect, useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { usePathname } from "expo-router";
import { Button } from "panelui-native/components/button";
import { Menu } from "panelui-native/components/menu";
import { CheckIcon, ChevronsUpDownIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";

import { ProjectPicture } from "@/components/project-picture";
import { useProjectScope } from "@/lib/project-scope-context";
import type { ProjectScope } from "@/lib/project-scope";

export function ProjectSwitcher() {
  const pathname = usePathname();
  const { height: windowHeight } = useWindowDimensions();
  const { scope, setScope, projects, currentProject, label } = useProjectScope();
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function choose(next: ProjectScope) {
    setScope(next);
    setOpen(false);
  }

  const selectedId = scope.kind === "project" ? scope.projectId : null;

  return (
    <View className="gap-1.5 px-1">
      <Text className="px-2 text-xs font-medium text-muted-foreground">Working on</Text>
      <View className="self-stretch" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <Menu open={open} onOpenChange={setOpen}>
          <Menu.Trigger>
            <Button
              variant="outline"
              accessibilityLabel={`Project scope, ${label}`}
              accessibilityState={{ expanded: open }}
              className="justify-start"
              style={width > 0 ? { width } : undefined}
              startContent={
                currentProject ? (
                  <ProjectPicture githubRepo={currentProject.githubRepo} name={currentProject.name} />
                ) : null
              }
              endContent={<ChevronsUpDownIcon size={14} />}>
              {label}
            </Button>
          </Menu.Trigger>
          <Menu.Content align="start" width={width > 0 ? width : "trigger"} maxHeight={Math.min(280, Math.max(120, windowHeight - 16))}>
            <Menu.Item
              onSelect={() => choose({ kind: "viewAll" })}
              trailing={scope.kind === "viewAll" ? <CheckIcon size={14} /> : undefined}>
              View all
            </Menu.Item>
            {(projects ?? []).map((project) => (
              <Menu.Item
                key={project._id}
                icon={<ProjectPicture githubRepo={project.githubRepo} name={project.name} size={20} />}
                trailing={selectedId === project._id ? <CheckIcon size={14} /> : undefined}
                onSelect={() => choose({ kind: "project", projectId: project._id })}>
                {project.name}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu>
      </View>
    </View>
  );
}

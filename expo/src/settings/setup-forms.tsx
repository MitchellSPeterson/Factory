import { useMutation } from "@/lib/factory";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Button } from "panelui-native/components/button";
import { Input } from "panelui-native/components/input";
import { Text } from "panelui-native/primitives/text";

import { api } from "@/lib/api";
import { pairingBase } from "@/lib/pairing";
import { sealSecret, serverVariableNames } from "@/lib/workerSettings";
import { SettingsGroup, SettingsIcons, SettingsMessage, SettingsRow } from "@/settings/ui";

export function PairPhone() {
  const [status, setStatus] = useState<{ pairing: string; tailscale: string; tunnel: string; token: string; pairCode: string }>({
    pairing: "",
    tailscale: "",
    tunnel: "",
    token: "",
    pairCode: "",
  });
  const [tunnel, setTunnel] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const load = () => Promise.all([
      fetch(`${pairingBase("127.0.0.1")}/status`).then((response) => response.json()),
      fetch(`${pairingBase("127.0.0.1")}/pair`).then((response) => response.json()),
    ])
      .then(([statusBody, pairBody]: [unknown, unknown]) => {
        const statusRecord = statusBody && typeof statusBody === "object" ? (statusBody as Record<string, unknown>) : {};
        const pairRecord = pairBody && typeof pairBody === "object" ? (pairBody as Record<string, unknown>) : {};
        setStatus({
          pairing: typeof statusRecord.pairing === "string" ? statusRecord.pairing : "",
          tailscale: typeof statusRecord.tailscale === "string" ? statusRecord.tailscale : "",
          tunnel: typeof statusRecord.tunnel === "string" ? statusRecord.tunnel : "",
          token: typeof pairRecord.token === "string" ? pairRecord.token : "",
          pairCode: typeof statusRecord.pairCode === "string" ? statusRecord.pairCode : "",
        });
        return statusRecord;
      })
      .catch(() => null);
    void load().then((record) => {
      if (record && typeof record.tunnel === "string") setTunnel(record.tunnel);
    });
    // The pairing code rotates after each use and every 10 minutes.
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
    <SettingsGroup
      title="Addresses"
      footer="On the same Wi-Fi, pair with the LAN address. On a tailnet, use the Tailscale address. Enter the pairing code on the phone; it changes after each use.">
      <SettingsRow
        icon={SettingsIcons.wifi}
        label="LAN"
        value={status.pairing || "Start the Worker to see the pairing address."}
        valueMode="middle"
      />
      <SettingsRow
        icon={SettingsIcons.network}
        label="Tailscale"
        value={status.tailscale || "Join this Mac to a tailnet to see an address."}
        valueMode="middle"
      />
      <SettingsRow
        icon={SettingsIcons.key}
        label="Pairing code"
        value={status.pairCode || "Start the Worker to see the pairing code."}
      />
      <SettingsRow
        icon={SettingsIcons.key}
        label="Pairing token"
        detail={status.token || "Start the Worker to see the household key."}
      />
    </SettingsGroup>
    <SettingsGroup title="Away From Home" footer="Save a public tunnel URL, then pair the phone with that URL and the token above.">
      <View className="gap-2 px-4 py-3">
        <Input
          accessibilityLabel="Public tunnel URL"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          placeholder="https://factory.example"
          value={tunnel}
          onChangeText={setTunnel}
        />
        <Button
          variant="ghost"
          className="self-start px-0"
          onPress={() => {
            void (async () => {
              try {
                const response = await fetch(`${pairingBase("127.0.0.1")}/settings`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ tunnelUrl: tunnel.trim() }),
                });
                const body: unknown = await response.json();
                if (!response.ok) {
                  throw new Error(
                    body && typeof body === "object" && "error" in body && typeof body.error === "string"
                      ? body.error
                      : "Could not save tunnel.",
                  );
                }
                setStatus((current) => ({ ...current, tunnel: tunnel.trim() }));
                setMessage("Tunnel saved. Pair the phone with that URL and the token from /pair.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not save tunnel.");
              }
            })();
          }}>
          Save public tunnel
        </Button>
        {message ? <Text size="sm" muted>{message}</Text> : null}
      </View>
    </SettingsGroup>
    </>
  );
}

/** One Worker environment value: shows whether it is saved and lets you replace it. */
export function VariableField({
  name,
  label,
  secret,
  placeholder,
  saved,
  publicKey,
}: {
  name: (typeof serverVariableNames)[number];
  label: string;
  secret: boolean;
  placeholder: string;
  saved: boolean;
  publicKey?: string;
}) {
  const setVariable = useMutation(api.servers.setVariable);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[15px] font-medium text-foreground">{label}</Text>
        <Text className={saved ? "text-[13px] text-success" : "text-[13px] text-muted-foreground"}>
          {saved ? "Saved" : "Not set"}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Input
          containerClassName="flex-1"
          accessibilityLabel={label}
          autoCapitalize="none"
          autoComplete={secret ? "new-password" : "off"}
          autoCorrect={false}
          secureTextEntry={secret}
          placeholder={saved ? "Enter a new value to replace it" : placeholder}
          value={value}
          onChangeText={(text) => {
            setValue(text);
            setMessage("");
          }}
        />
        <Button
          accessibilityLabel={`Save ${label}`}
          disabled={!value.trim()}
          onPress={() => {
            void (async () => {
              try {
                if (!publicKey) throw new Error("Start the Worker first.");
                await setVariable({ scope: "server", name, sealed: await sealSecret(publicKey, value.trim()) });
                setValue("");
                setMessage("Saved. The Worker picks it up within a minute.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not save.");
              }
            })();
          }}>
          Save
        </Button>
      </View>
      {message ? <Text size="sm" muted>{message}</Text> : null}
    </View>
  );
}

export function GitHubGroup({
  github,
  disconnectGithub,
}: {
  github: { login: string; token: string } | null | undefined;
  disconnectGithub: () => Promise<null>;
}) {
  if (github === undefined) {
    return (
      <SettingsGroup title="GitHub">
        <SettingsMessage>Checking GitHub…</SettingsMessage>
      </SettingsGroup>
    );
  }
  if (!github) {
    return (
      <SettingsGroup title="GitHub" footer="Connect from Clone from GitHub when you add a Project.">
        <SettingsMessage>Not connected.</SettingsMessage>
      </SettingsGroup>
    );
  }
  return (
    <SettingsGroup title="GitHub" footer="Used to list and clone repositories into the Worker folder.">
      <SettingsRow icon={SettingsIcons.project} label={github.login} value="Connected" />
      <View className="px-4 py-3">
        <Button variant="ghost" className="self-start px-0" labelClassName="text-destructive" onPress={() => void disconnectGithub()}>
          Disconnect
        </Button>
      </View>
    </SettingsGroup>
  );
}

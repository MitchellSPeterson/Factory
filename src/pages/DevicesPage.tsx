import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DeviceScreen } from "../devices/DeviceScreen";

type SimDevice = {
  udid: string;
  name: string;
  state: string;
  runtime?: string;
  streamUrl?: string;
  wsUrl?: string;
};

export function DevicesPage() {
  const live = useQuery(api.servers.local);
  const setWanted = useMutation(api.servers.setSimHubWanted);
  const enqueue = useMutation(api.servers.enqueueDeviceCommand);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const hub = live?.simHub;
  const devices = hub?.devices ?? [];
  const online = !!(live && now - live.lastSeen < 45_000);
  const wanted = live?.simHubWanted === true;
  const current = devices.find((device) => device.udid === selected) ?? preferredDevice(devices);

  useEffect(() => {
    if (current && current.udid !== selected) setSelected(current.udid);
  }, [current, selected]);

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this Device.");
    } finally {
      setBusy("");
    }
  }

  if (live === undefined) {
    return <div className="devices-shell"><Empty title="Devices" body="Checking this machine…" /></div>;
  }

  if (live === null || !online) {
    return <div className="devices-shell"><Empty title="Devices" body="This machine is offline. Start the worker, then return here." /></div>;
  }

  if (hub && !hub.supported) {
    return <div className="devices-shell"><Empty title="Devices" body={hub.message ?? "iOS Simulator preview needs macOS with Xcode."} /></div>;
  }

  return (
    <div className="devices-shell">
      <header className="devices-head">
        <div>
          <p className="eyebrow">This machine</p>
          <h1>Devices</h1>
          <p className="muted">{hub?.message ?? "Live iOS Simulator preview through serve-sim."}</p>
        </div>
        <div className="devices-head-actions">
          <span className={`provider-status ${wanted && hub?.running ? "configured" : ""}`}>
            {hub?.running ? "Preview on" : wanted ? "Starting…" : "Preview off"}
          </span>
          {wanted ? (
            <button type="button" className="ghost" disabled={busy !== ""} onClick={() => void run("stop", () => setWanted({ wanted: false }))}>
              {busy === "stop" ? "Stopping…" : "Stop preview"}
            </button>
          ) : (
            <button type="button" disabled={busy !== ""} onClick={() => void run("start", () => setWanted({ wanted: true }))}>
              {busy === "start" ? "Starting…" : "Start preview"}
            </button>
          )}
        </div>
      </header>
      <div className="devices-body">
        <aside className="devices-list" aria-label="Simulators">
          {devices.length === 0 ? (
            <p className="muted">No simulators yet. Add one in Xcode → Settings → Platforms.</p>
          ) : devices.map((device) => (
            <div className={`device-row ${current?.udid === device.udid ? "active" : ""}`} key={device.udid}>
              <button type="button" className="device-row-main" onClick={() => setSelected(device.udid)}>
                <strong>{device.name}</strong>
                <small>{device.runtime ? `${device.runtime} · ${device.state}` : device.state}</small>
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy !== ""}
                onClick={() => void run(device.udid, () => enqueue({
                  command: device.state === "booted" ? { kind: "shutdown", udid: device.udid } : { kind: "boot", udid: device.udid },
                }))}
              >
                {busy === device.udid ? "…" : device.state === "booted" ? "Shut down" : "Boot"}
              </button>
            </div>
          ))}
        </aside>
        {current?.streamUrl ? (
          <DeviceScreen
            name={current.name}
            streamUrl={current.streamUrl}
            wsUrl={current.wsUrl}
            onHome={() => void run("home", () => enqueue({ command: { kind: "button", udid: current.udid, name: "home" } }))}
          />
        ) : (
          <Empty
            as="h2"
            title={current?.name ?? "No Device selected"}
            body={
              current?.state === "booted"
                ? (wanted ? "Waiting for serve-sim to publish this stream." : "Start preview to watch and interact with this simulator.")
                : "Boot a simulator, then start preview."
            }
          />
        )}
      </div>
      {error ? <p className="error devices-error" role="alert">{error}</p> : null}
    </div>
  );
}

function preferredDevice(devices: SimDevice[]) {
  return devices.find((device) => device.streamUrl) ?? devices.find((device) => device.state === "booted") ?? devices[0];
}

function Empty({ title, body, action, as: Heading = "h1" }: { title: string; body: string; action?: ReactNode; as?: "h1" | "h2" }) {
  return (
    <div className="devices-empty">
      <Heading>{title}</Heading>
      <p>{body}</p>
      {action}
    </div>
  );
}

import { useEffect, useRef } from "react";

import { api } from "@/lib/api";
import type { Doc, Id } from "@/lib/dataModel";
import { useMutation, useQuery } from "@/lib/factory";

const POLL_MS = 15_000;
const MIN_GAP_MS = 10_000;
// Shared by every mounted hook, so the sheet and workspace don't double up.
const lastEnqueued = new Map<string, number>();

/**
 * Project operation rows plus a `refresh` that enqueues a `status` op. Refresh is skipped when
 * one is already queued/running or was enqueued < 10s ago (unless `force`, for a user tap or
 * after an action finished). While `visible`, it also polls every 15s.
 */
export function useGitStatus(projectId: Id<"projects">, visible = true) {
  const rows = useQuery(api.projectOperations.list, visible ? { projectId } : "skip");
  const enqueue = useMutation(api.projectOperations.enqueue);
  const rowsRef = useRef<Doc<"projectOperations">[] | undefined>(rows);
  rowsRef.current = rows;
  const inFlight = useRef(false);

  async function refresh(force = false) {
    if (inFlight.current) return;
    const key = String(projectId);
    const busy = rowsRef.current?.some(
      (row) => row.operation.kind === "status" && (row.state === "queued" || row.state === "running"),
    );
    if (busy || (!force && Date.now() - (lastEnqueued.get(key) ?? 0) < MIN_GAP_MS)) return;
    inFlight.current = true;
    lastEnqueued.set(key, Date.now());
    try {
      await enqueue({ projectId, operation: { kind: "status" } });
    } finally {
      inFlight.current = false;
    }
  }

  // Latest closure for the interval, which otherwise captures a stale one.
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => void latest.current().catch(() => {}), POLL_MS);
    return () => clearInterval(timer);
  }, [visible, projectId]);

  return { rows, refresh };
}

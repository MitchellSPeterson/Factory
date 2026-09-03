# Verify

Prove the Job against the real artifact, not a proxy.

- `web` or the web side of `mixed`: exercise the changed flow in the browser. Click, type, submit, navigate. A screenshot is not verification.
- `expo` or the native side of `mixed`: use the RN debugger tools. Screenshot plus the interaction, not a still frame alone.
- Hunt regressions on routes that share the state you touched.
- If verification fails, fix it and re-verify. Do not finish failed.

Submit nothing unless you found a durable note the next stage needs. Call `finish_stage` when the spec's acceptance lines hold.

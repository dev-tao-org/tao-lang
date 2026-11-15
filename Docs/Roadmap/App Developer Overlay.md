# App Developer Overlay

Agreed future behavior: for now, all apps run with dev mode enabled. A two-finger double-tap opens a developer overlay above the app.

Initial activation is gesture-only. The remaining menu, capture and editing details are explicitly deferred for later design and implementation; the capability list below is a recorded target, not an implementation-ready contract.

## Accepted capabilities

- Show developer information and options, including bounds for elements in the render tree.
- Inspect recorded events, including failures and their debug rendering. Structured failure issue metadata remains accessible to app logic; full rejected payloads remain behind the diagnostic rendering contract.
- Export the entire app state for import into Studio for debugging.
- Enter edit mode to move and edit on-screen elements.

## Implementation placement

This is a separate developer-tools workstream, not an implicit expansion of the initial sidecar proof. Event/failure inspection depends on managed runtime boundaries and stable source/runtime identity. Capture requires a defined state format and Studio import path. Editing must integrate with [Studio Canvas](Studio%20Canvas.md) working-copy and source-edit ownership rather than introduce a competing edit pipeline.

Implementation and device acceptance are pending. Exact capture coverage, event retention, later non-touch activation and edit persistence are deferred. Do not assume source working copies or immediate runtime edits have been selected for this overlay.

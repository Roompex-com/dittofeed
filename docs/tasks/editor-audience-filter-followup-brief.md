# Brief (follow-up): channel editors consume the audience-filtered user property list

Branch `roompex-property-audience` (already checked out). Builds on the UNCOMMITTED working-tree changes from `user-property-audience-brief.md` — do not revert or reformat them. ADDITIVE only, three files.

## Context

`templateEditor.tsx` now computes an audience-filtered `userProperties` list (memoized on the template's `audience`) and passes it into `RenderEditorParams.userProperties` (new optional field, `templateEditor.tsx` ~line 269, threaded at ~line 855). But the channel editors still read the FULL list from the global app store, so their variable pickers ignore the filter. This brief makes them consume the filtered param.

## Deliverables

1. `packages/dashboard/src/components/messages/emailEditor.tsx` — the variable/completion options built from the store list (around lines 91–99) and any other variable-picker use of the store list (e.g. ~line 238): prefer `RenderEditorParams.userProperties` when it is defined (non-empty array), falling back to the store list when undefined — the same editors are hosted by journeys/broadcasts where the param is absent and today's behavior must be preserved exactly. The param is in scope where `renderEditorBody({...})` is destructured (~line 493); thread it down to wherever the options memo lives.
2. `packages/dashboard/src/components/messages/lowCodeEmailBodyEditor.tsx` — same rule for its store-derived property list.
3. `packages/dashboard/src/components/messages/webhookEditor.tsx` — same rule (~line 68).
4. Do NOT touch `smsEditor.tsx` (no variable picker), `templateEditor.tsx`, or anything else.

Empty-array vs undefined: `RenderEditorParams.userProperties` may legitimately be `[]` (template audience set, zero matching properties) — `[]` must WIN over the store (hide all variables), only `undefined` falls back. Preserve this distinction.

## Acceptance criteria (literal)

- All four `yarn workspace {isomorphic-lib,backend-lib,api,dashboard} run check` exit 0.
- `git diff --stat` beyond the previous changeset touches only the three editor files.
- In `emailEditor.tsx`, grep shows the variable options derive from a prop/param list with a store fallback, not the store unconditionally.
- No behavior change when the param is absent (journey/broadcast editors).

## Do not

- Do not commit; leave changes in the working tree.
- Do not probe any external API or site.

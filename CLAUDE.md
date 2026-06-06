# Claude Code project rules

## Off-limits files
- Do NOT read, reference, or open any file inside `ref/archive/` or any path containing `/archive/`.
  These are historical snapshots and are not relevant to the current build.

## Active build context
- Primary scope doc: `BUILD_CHECKLIST_2026-06-06.md` (current done/left tracker)
- Companion scope: `ref/END_TO_END_HACK_SCOPE_2026-06-06.md`
- Navid owns: `sandbox/bin/router-server.ts`, `sandbox/lib/router/pay.ts`, `sandbox/lib/router/context.ts`; `sandbox/lib/router/contract.ts` is frozen shared API
- Do NOT touch `sandbox/bin/berlin-server.js` or any `sandbox/lib/x402/*` file.

## INTEGRATION_HANDOFF.md — keep it current

`INTEGRATION_HANDOFF.md` is the shared handoff doc between all four engineers' Claude sessions.

**Rules:**
- Read it at the start of every session before writing any code.
- When you complete a step, add a new endpoint, or produce something a teammate depends on — update that engineer's section in `INTEGRATION_HANDOFF.md` immediately.
- Mark a section ✅ DONE only when the code is committed and the server boots with it.
- If you consume something from a teammate's section, leave it unchanged — only the owner of that section updates it.
- Keep entries short and concrete: endpoint signatures, Map keys, function names. No prose.

// Projection gate — emergence-class corrections are local-only by category (PPA #5 substrate).
//
// Lifted from liminal-notion-hack/src/notion-tools/event-schemas.ts (the projection gate only; the
// Notion-specific payload bounds do not apply here). This is the single enforcement point for the
// canon rule that a user's emergence correction — the highest-value third the system did not
// offer — never crosses a boundary outward. Recorded locally as first-class data, never projected.

export interface ProjectableEventLike {
  kind: string;
  payload: { correction_kind?: string } & Record<string, unknown>;
}

// emergence-class corrections are local-only by category. The gate refuses to emit them outward.
export function isProjectable(e: ProjectableEventLike): boolean {
  if (e.kind === "correction" && e.payload.correction_kind === "emergence") {
    return false;
  }
  return true;
}

import type * as Preview from '@shared/preview'

type OptionalExpectation = Preview.PreviewExpectation | undefined
type PreviewOutcomes = ReadonlyMap<string, Preview.PreviewOutcome>

/** restoreFrameRecovery initializes a fresh frame with publications received before it was mounted. */
export function restoreFrameRecovery(
  recovery: Preview.PreviewRecovery,
  baseline: OptionalExpectation,
  latest: OptionalExpectation,
  outcomes: PreviewOutcomes,
): void {
  if (baseline) {
    recovery.setBaseline(baseline)
    recovery.expect(baseline)
  }
  if (!latest || latest.sequence < (baseline?.sequence ?? 0)) {
    return
  }
  if (latest.revision !== baseline?.revision) {
    recovery.expect(latest)
  }
  const outcome = outcomes.get(latest.revision)
  if (outcome) {
    recovery.terminal(outcome)
  }
}

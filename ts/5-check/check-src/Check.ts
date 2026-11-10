/** CheckResult records the explicitly deferred semantic-checking stage. */
export type CheckResult = { readonly stage: 'check'; readonly status: 'skipped' }

/** check records the explicitly deferred semantic-checking stage. */
export function check(): CheckResult {
  return { stage: 'check', status: 'skipped' } as const
}

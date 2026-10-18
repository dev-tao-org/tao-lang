/** check records the explicitly deferred semantic-checking stage. */
export function check() {
  return { stage: 'check', status: 'skipped' } as const
}

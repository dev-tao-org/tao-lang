/** fix records the explicitly deferred repair stage. */
export function fix() {
  return { stage: 'fix', status: 'skipped' } as const
}

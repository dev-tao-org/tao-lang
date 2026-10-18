/** typecheck records the explicitly deferred type-checking stage. */
export function typecheck() {
  return { stage: 'typecheck', status: 'skipped' } as const
}

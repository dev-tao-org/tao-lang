/** TypecheckResult records the explicitly deferred type-checking stage. */
export type TypecheckResult = { readonly stage: 'typecheck'; readonly status: 'skipped' }

/** typecheck records the explicitly deferred type-checking stage. */
export function typecheck(): TypecheckResult {
  return { stage: 'typecheck', status: 'skipped' } as const
}

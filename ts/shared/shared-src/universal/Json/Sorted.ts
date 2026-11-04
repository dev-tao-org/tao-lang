import * as Sort from '../Sort'
import { Print } from './Native'

/** Sorted serializes with recursive ordinal object-key ordering while retaining native JSON behavior. */
export function Sorted(value: unknown): string | undefined {
  return Print(value, { prettyPrint: false, replacer: sortRecordKeys })
}

function sortRecordKeys(_key: string, value: unknown): unknown {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return value
  }
  const sorted = Object.create(null) as Record<string, unknown>
  for (const key of Object.keys(value).sort(Sort.CompareStrings)) {
    sorted[key] = (value as Record<string, unknown>)[key]
  }
  return sorted
}

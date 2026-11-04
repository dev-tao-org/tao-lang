import * as Json from '../universal/Json'
import * as Node from './bridges/Bridge_node/Bridge_node'

/** Of returns a lowercase SHA-256 digest of the deterministic JSON encoding. */
export function Of(value: unknown): string {
  const encoded = Json.Sorted(value)
  return Node.createHash('sha256').update(encoded ?? 'undefined').digest('hex')
}

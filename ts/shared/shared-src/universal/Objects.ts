/** ObjectCopy describes a shallow copy with writable own properties. */
export type ObjectCopy<T extends object> = { -readonly [Key in keyof T]: T[Key] }

/** copy creates a shallow ordinary-object copy of enumerable own record or namespace fields.
 *  Nested values retain their references; class instances, arrays and callable objects are outside this contract. */
export function copy<T extends object>(source: T): ObjectCopy<T> {
  return { ...source }
}

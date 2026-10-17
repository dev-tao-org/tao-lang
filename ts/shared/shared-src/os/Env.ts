/** get reads a variable from the current process environment. */
export function get(key: string): string | undefined {
  return process.env[key]
}

/** set updates a variable in the current process environment. */
export function set(key: string, value: string): void {
  process.env[key] = value
}

/** is checks whether an environment variable equals the supplied value. */
export function is(key: string, value: string): boolean {
  return get(key) === value
}

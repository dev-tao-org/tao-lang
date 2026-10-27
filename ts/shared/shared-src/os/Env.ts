import { hostProcess } from './bridges/Bridge_node/Bridge_node'
/** get reads a variable from the current process environment. */
export function get(key: string): string | undefined {
  return hostProcess.env[key]
}

/** snapshot copies the current environment for a child with explicit local overrides. */
export function snapshot(): Record<string, string | undefined> {
  return { ...hostProcess.env }
}

/** set updates a variable in the current process environment. */
export function set(key: string, value: string): void {
  hostProcess.env[key] = value
}

/** is checks whether an environment variable equals the supplied value. */
export function is(key: string, value: string): boolean {
  return get(key) === value
}

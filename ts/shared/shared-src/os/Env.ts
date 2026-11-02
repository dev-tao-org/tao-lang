import * as Errors from '../universal/Errors'
import * as Objects from '../universal/Objects'
import { hostProcess } from './bridges/Bridge_node/Bridge_node'

type EnvironmentValue = string | undefined
type ProcessEnvironment = Record<string, EnvironmentValue>
type ProcessLike = { env: ProcessEnvironment }
type EnvironmentKeyValuePair = [key: string, value: EnvironmentValue]

class Env {
  constructor(private readonly process: ProcessLike) {}

  // Read a variable from the current process environment.
  get(key: string): string | undefined {
    return this.process.env[key]
  }

  // Require a variable to be defined by the host environment.
  require(name: string): string {
    return this.get(name) ?? Errors.ThrowHostEnvironment(`Missing environment variable: ${name}`)
  }

  // Compare a variable with an expected value.
  is(key: string, value: string): boolean {
    return this.get(key) === value
  }

  // Return a readonly copy of the complete environment.
  values(): Readonly<ProcessEnvironment> {
    return Objects.copy(this.process.env)
  }

  // Read requested keys in their supplied order, including missing values.
  KeyValuePairs(names: readonly string[] = Object.keys(this.process.env)): EnvironmentKeyValuePair[] {
    return names.map(name => [name, this.process.env[name]])
  }

  // Create an independent environment with the supplied overrides.
  clone(overrides: ProcessEnvironment = {}): Env {
    return new Env({ env: applyOverrides(this.process.env, overrides) })
  }
}

/** env provides live environment reads and detached clones without changing the current process. */
const env = new Env(hostProcess)

function applyOverrides(environment: Readonly<ProcessEnvironment>, overrides: ProcessEnvironment): ProcessEnvironment {
  const result = Objects.copy(environment)
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete result[key]
    } else {
      result[key] = value
    }
  }
  return result
}

export default env

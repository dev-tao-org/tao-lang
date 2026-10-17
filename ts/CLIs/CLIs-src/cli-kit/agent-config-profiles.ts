import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { flattenDiagnosticMessageText, parseConfigFileTextToJson } from 'typescript'

type AgentProfile = {
  description: string
  extends?: string
  ask?: readonly string[]
  allow?: readonly string[]
  excludedCommands?: readonly string[]
  allowWrite?: readonly string[]
  unixSockets?: readonly string[]
  sandbox?: boolean
}

/** AgentProfiles maps canonical profile names to their overlays. */
export type AgentProfiles = Readonly<Record<string, AgentProfile>>

const profileSourcePath = '.rulesync/profiles.jsonc'

/** parseProfiles validates and reads canonical opt-in profiles. */
export function parseProfiles(source: string): AgentProfiles {
  const parsed = parseConfigFileTextToJson(profileSourcePath, source)
  if (parsed.error !== undefined) {
    Errors.ThrowUserInput(
      `Invalid ${profileSourcePath}: ${flattenDiagnosticMessageText(parsed.error.messageText, '\n')}`,
    )
  }
  if (!isRecord(parsed.config)) {
    Errors.ThrowUserInput(`${profileSourcePath} must contain an object.`)
  }
  const rawProfiles = parsed.config.profiles ?? {}
  if (!isRecord(rawProfiles)) {
    Errors.ThrowUserInput(`The profiles member of ${profileSourcePath} must be an object.`)
  }
  const profiles: Record<string, AgentProfile> = {}
  for (const [name, value] of Object.entries(rawProfiles)) {
    if (!isProfile(value)) {
      Errors.ThrowUserInput(`Profile '${name}' in ${profileSourcePath} has an invalid shape.`)
    }
    if (value.extends !== undefined && rawProfiles[value.extends] === undefined) {
      Errors.ThrowUserInput(`Profile '${name}' extends unknown profile '${value.extends}' in ${profileSourcePath}.`)
    }
    profiles[name] = value
  }
  return profiles
}

/** readProfiles loads the canonical profiles from a checkout. */
export async function readProfiles(root: string): Promise<AgentProfiles> {
  return parseProfiles(await FileSystem.file(Path.resolve(root, profileSourcePath)).text())
}

/** inheritedWritePaths collects filesystem grants from a profile and all ancestors. */
export function inheritedWritePaths(profiles: AgentProfiles, name: string): string[] {
  const profile = profiles[name]
  if (profile === undefined) {
    Errors.ThrowUserInput(`Unknown agent profile '${name}' in ${profileSourcePath}.`)
  }
  const inherited = profile.extends === undefined ? [] : inheritedWritePaths(profiles, profile.extends)
  return [...new Set([...inherited, ...(profile.allowWrite ?? [])])]
}

function isProfile(value: unknown): value is AgentProfile {
  return isRecord(value) && typeof value.description === 'string'
    && (value.extends === undefined || typeof value.extends === 'string')
    && (value.sandbox === undefined || typeof value.sandbox === 'boolean')
    && isOptionalStringArray(value.ask) && isOptionalStringArray(value.allow)
    && isOptionalStringArray(value.excludedCommands) && isOptionalStringArray(value.allowWrite)
    && isOptionalStringArray(value.unixSockets)
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(item => typeof item === 'string'))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

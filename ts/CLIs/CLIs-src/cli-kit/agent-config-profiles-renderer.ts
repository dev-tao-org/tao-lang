import { Errors, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { type AgentProfiles, inheritedWritePaths, readProfiles } from './agent-config-profiles'
import { IO } from './cli-kit'

const settingsSchema = 'https://json.schemastore.org/claude-code-settings.json'

type ClaudeSettings = {
  $schema: string
  permissions?: { allow?: string[]; ask?: string[] }
  sandbox?: { enabled?: boolean; excludedCommands?: string[]; filesystem?: { allowWrite?: string[] } }
}

/** profileSettingsPath returns the generated Claude settings path for one profile. */
export function profileSettingsPath(name: string): string {
  return `.claude/settings.${name}.json`
}

/** renderClaudeProfile creates a complete Claude settings file for one opt-in profile. */
export function renderClaudeProfile(profiles: AgentProfiles, name: string): string {
  const profile = profiles[name]!
  const settings: ClaudeSettings = { $schema: settingsSchema }
  if (profile.sandbox === false) {
    settings.sandbox = { enabled: false }
    return `${JSON.stringify(settings, null, 2)}\n`
  }
  const ask = [...(profile.ask ?? [])].sort()
  const allow = [...(profile.allow ?? [])].sort()
  if (ask.length + allow.length > 0) {
    settings.permissions = {
      ...(allow.length === 0 ? {} : { allow: allow.map(pattern => `Bash(${pattern})`) }),
      ...(ask.length === 0 ? {} : { ask: ask.map(pattern => `Bash(${pattern})`) }),
    }
  }
  const excludedCommands = [...new Set([...ask, ...(profile.excludedCommands ?? [])])].sort()
  const allowWrite = inheritedWritePaths(profiles, name).sort()
  if (excludedCommands.length + allowWrite.length > 0) {
    settings.sandbox = {
      ...(excludedCommands.length === 0 ? {} : { excludedCommands }),
      ...(allowWrite.length === 0 ? {} : { filesystem: { allowWrite } }),
    }
  }
  return `${JSON.stringify(settings, null, 2)}\n`
}

/** generateClaudeProfiles writes each canonical profile as a standalone settings file. */
export async function generateClaudeProfiles(options: {
  onSkip?: (message: string) => void
  root: string
  writeText?: (path: string, content: string) => Promise<void>
}): Promise<void> {
  const profiles = await readProfiles(options.root)
  for (const name of Object.keys(profiles)) {
    const path = Path.resolve(options.root, profileSettingsPath(name))
    await Try(() => (options.writeText ?? writeText)(path, renderClaudeProfile(profiles, name)), {
      catch(error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EACCES' && code !== 'EPERM') {
          return Errors.Throw(error)
        }
        ;(options.onSkip ?? IO.error)(
          `Skipped claudecode profile '${name}': ${path} is not writable.`,
        )
      },
    })
  }
}

async function writeText(path: string, content: string): Promise<void> {
  await FileSystem.write(path, content)
}

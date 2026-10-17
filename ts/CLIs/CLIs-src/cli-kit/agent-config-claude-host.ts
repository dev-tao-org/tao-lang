import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { generate, type GenerateOptions } from 'rulesync'
import { flattenDiagnosticMessageText, parseConfigFileTextToJson } from 'typescript'

type PermissionLists = { allow?: string[]; ask?: string[]; deny?: string[] }
type RenderedShape = { readonly [key: string]: true | RenderedShape }
type HostSource = { agentHostCommands?: unknown; claudecode?: unknown }

const sourcePath = '.rulesync/permissions.jsonc'
const settingsPath = '.claude/settings.json'
const renderedRules: RenderedShape = { $schema: true, hooks: true, permissions: { allow: true, ask: true, deny: true } }
const permissionKeys = new Set(['allow', 'ask', 'deny'])

/** agentHostCommandPrefixes validates the literal host operation list for generated allowances. */
export function agentHostCommandPrefixes(source: HostSource): string[][] {
  const entries = source.agentHostCommands
  if (!Array.isArray(entries)) {
    Errors.ThrowUserInput(`${sourcePath} must contain an agentHostCommands array.`)
  }
  const seen = new Set<string>()
  return entries.map((entry: unknown) => {
    if (typeof entry !== 'string' || !/^[^\s*?\[\]]+(?: [^\s*?\[\]]+)*$/u.test(entry) || seen.has(entry)) {
      Errors.ThrowUserInput(`Invalid or duplicate agentHostCommands prefix: ${String(entry)}`)
    }
    seen.add(entry)
    return entry.split(' ')
  })
}

/** renderClaudeHostSettings adds the approved host-operation forms to rendered Claude settings. */
export function renderClaudeHostSettings(
  content: string,
  prefixes: readonly (readonly string[])[],
  claudecode?: Record<string, unknown>,
  pristineLists?: PermissionLists,
): string {
  const rendered = parseJson(content, settingsPath)
  const settings = (claudecode === undefined ? rendered : withoutRemovedKeys(rendered, claudecode, renderedRules)) as {
    permissions?: PermissionLists & Record<string, unknown>
    sandbox?: { excludedCommands?: string[] }
  }
  if (pristineLists !== undefined) {
    settings.permissions = {
      ...Object.fromEntries(Object.entries(settings.permissions ?? {}).filter(([key]) => !permissionKeys.has(key))),
      ...pristineLists,
    }
  }
  const shapes = hostShapes(prefixes)
  settings.permissions = {
    ...settings.permissions,
    allow: [
      ...(settings.permissions?.allow ?? []).filter(rule => !/^Bash\(\.\/agent unsandboxed(?: |\))/u.test(rule)),
      ...shapes.map(shape => `Bash(${shape})`),
    ],
  }
  settings.sandbox = { ...settings.sandbox, excludedCommands: shapes }
  return `${JSON.stringify(settings, null, 2)}\n`
}

/** generateClaudeHostSettings augments an existing Claude settings file after Rulesync generation. */
export async function generateClaudeHostSettings(options: {
  generate?: (options: GenerateOptions) => Promise<unknown>
  root: string
  writeText?: (path: string, content: string) => Promise<void>
}): Promise<void> {
  const path = Path.resolve(options.root, settingsPath)
  if (!FileSystem.existsSync(path)) {
    return
  }
  const parsed = parseConfigFileTextToJson(
    sourcePath,
    await FileSystem.file(Path.resolve(options.root, sourcePath)).text(),
  )
  if (parsed.error !== undefined || !isRecord(parsed.config)) {
    const detail = parsed.error === undefined
      ? 'source must contain an object'
      : flattenDiagnosticMessageText(parsed.error.messageText, '\n')
    Errors.ThrowUserInput(`Invalid ${sourcePath}: ${detail}`)
  }
  const source = parsed.config as HostSource & { claudecode?: Record<string, unknown> }
  const prefixes = agentHostCommandPrefixes(source)
  const current = await FileSystem.file(path).text()
  const pristineLists = await pristinePermissionLists(options.root, options.generate ?? generate)
  const next = renderClaudeHostSettings(
    current,
    prefixes,
    isRecord(source.claudecode) ? source.claudecode : undefined,
    pristineLists,
  )
  if (next !== current) {
    await (options.writeText ?? writeText)(path, next)
  }
}

async function pristinePermissionLists(
  root: string,
  generateRules: (options: GenerateOptions) => Promise<unknown>,
): Promise<PermissionLists> {
  const scratch = await FileSystem.mkdtemp(Path.join(Platform.tmpdir(), 'tao-agent-permissions-'))
  return Try(async () => {
    await generateRules({
      configPath: '.rulesync/rulesync.jsonc',
      features: ['permissions'],
      inputRoot: root,
      outputRoots: [scratch],
      silent: true,
      targets: ['claudecode'],
    })
    const file = Path.resolve(scratch, settingsPath)
    const settings = parseJson(await FileSystem.file(file).text(), file)
    return isRecord(settings.permissions) ? settings.permissions as PermissionLists : {}
  }, {
    finally() {
      return FileSystem.rm(scratch, { force: true, recursive: true })
    },
  })
}

function hostShapes(prefixes: readonly (readonly string[])[]): string[] {
  return [...new Set(prefixes.map(prefix => prefix[0]!))].flatMap(operation => [
    `./agent unsandboxed ${operation}`,
    `./agent unsandboxed ${operation} *`,
  ])
}

function withoutRemovedKeys(
  rendered: Record<string, unknown>,
  source: Record<string, unknown>,
  renders: RenderedShape = {},
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rendered).flatMap(([key, value]) => {
      const renderedKey = Object.hasOwn(renders, key) ? renders[key] : undefined
      if (renderedKey === true) {
        return [[key, value]]
      }
      if (renderedKey === undefined && !Object.hasOwn(source, key)) {
        return []
      }
      const nested = isRecord(value)
        ? withoutRemovedKeys(value, isRecord(source[key]) ? source[key] : {}, renderedKey)
        : value
      return [[key, nested]]
    }),
  )
}

function parseJson(source: string, path: string): Record<string, unknown> {
  const parsed = parseConfigFileTextToJson(path, source)
  if (parsed.error !== undefined || !isRecord(parsed.config)) {
    const detail = parsed.error === undefined
      ? 'content must contain an object'
      : flattenDiagnosticMessageText(parsed.error.messageText, '\n')
    Errors.ThrowUserInput(`Invalid ${path}: ${detail}`)
  }
  return parsed.config
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function writeText(path: string, content: string): Promise<void> {
  await FileSystem.write(path, content)
}

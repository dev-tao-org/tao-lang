import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform, Repo } from '@shared/os'
import { type Feature, generate, type GenerateOptions, type ToolTarget } from 'rulesync'
import { flattenDiagnosticMessageText, parseConfigFileTextToJson } from 'typescript'
import { generateClaudeHostSettings } from './agent-config-claude-host'
import { generateCodexConfig } from './agent-config-codex'
import { parsePermissions } from './agent-config-codex'
import { generateClaudeProfiles } from './agent-config-profiles-renderer'
import { IO } from './cli-kit'

const targetFeatures = {
  codexcli: ['subagents', 'hooks'],
  claudecode: ['subagents', 'permissions', 'hooks'],
  cursor: ['subagents'],
} satisfies Record<string, Feature[]>

const guardedOutputs: Record<string, string[]> = {
  codexcli: ['.codex/agents'],
  claudecode: ['.claude/agents', '.claude/settings.json'],
  cursor: ['.cursor/agents'],
}

type Dependencies = {
  generate?: (options: GenerateOptions) => Promise<unknown>
  generateClaudeProfiles?: typeof generateClaudeProfiles
  generateCodexConfig?: typeof generateCodexConfig
  generateClaudeHostSettings?: typeof generateClaudeHostSettings
  isFile?: (path: string) => boolean
  readText?: (path: string) => Promise<string>
  remove?: (path: string) => Promise<void>
  mkdtemp?: (prefix: string) => Promise<string>
  onSkip?: (message: string) => void
  root: string
  writeText?: (path: string, content: string) => Promise<void>
}

/** generateAgentConfig renders canonical repository agent sources into harness adapters. */
export async function generateAgentConfig(dependencies: Dependencies): Promise<void> {
  const generateTarget = dependencies.generate ?? generate
  for (const target of Object.keys(targetFeatures) as ToolTarget[]) {
    await generateTargetConfig(dependencies, target, generateTarget)
  }
  await generateSupplementalConfig(dependencies, generateTarget)
}

async function generateTargetConfig(
  dependencies: Dependencies,
  target: ToolTarget,
  generateTarget: (options: GenerateOptions) => Promise<unknown>,
): Promise<void> {
  await Try(async () => {
    if (target === 'claudecode') {
      await recoverConflictedSettings(dependencies, generateTarget)
    }
    return generateTarget({
      configPath: '.rulesync/rulesync.jsonc',
      features: targetFeatures[target as keyof typeof targetFeatures],
      inputRoot: dependencies.root,
      outputRoots: [dependencies.root],
      targets: [target],
    })
  }, {
    catch(error) {
      if (!isBlockedAdapterOutput(error, target, dependencies.root)) {
        return Errors.Throw(error)
      }
      const path = (error as NodeJS.ErrnoException).path
      reportSkip(dependencies, `Skipped ${target} agent config: ${path} is not writable.`)
    },
  })
}

async function generateSupplementalConfig(
  dependencies: Dependencies,
  generateTarget: (options: GenerateOptions) => Promise<unknown>,
): Promise<void> {
  await Try(() => generateClaudeHostConfig(dependencies, generateTarget), {
    catch(error) {
      if (!isBlockedAdapterOutput(error, 'claudecode', dependencies.root)) {
        return Errors.Throw(error)
      }
      const path = (error as NodeJS.ErrnoException).path
      reportSkip(dependencies, `Skipped claudecode host rules: ${path} is not writable.`)
    },
  })
  await generateCodexAndClaudeProfiles(dependencies)
}

async function generateClaudeHostConfig(
  dependencies: Dependencies,
  generateTarget: (options: GenerateOptions) => Promise<unknown>,
): Promise<void> {
  await (dependencies.generateClaudeHostSettings ?? generateClaudeHostSettings)({
    generate: generateTarget,
    root: dependencies.root,
    ...(dependencies.writeText === undefined ? {} : { writeText: dependencies.writeText }),
  })
}

async function generateCodexAndClaudeProfiles(dependencies: Dependencies): Promise<void> {
  await (dependencies.generateCodexConfig ?? generateCodexConfig)({
    onSkip: dependencies.onSkip,
    root: dependencies.root,
    ...(dependencies.writeText === undefined ? {} : { writeText: dependencies.writeText }),
  })
  await (dependencies.generateClaudeProfiles ?? generateClaudeProfiles)({
    onSkip: dependencies.onSkip,
    root: dependencies.root,
    ...(dependencies.writeText === undefined ? {} : { writeText: dependencies.writeText }),
  })
}

/** generateRepositoryAgentConfig executes the root command using checkout-local I/O. */
export async function generateRepositoryAgentConfig(): Promise<void> {
  await generateAgentConfig({ root: Repo.getWorkspaceRoot() })
}

async function recoverConflictedSettings(
  dependencies: Dependencies,
  generateTarget: (options: GenerateOptions) => Promise<unknown>,
): Promise<void> {
  const relative = '.claude/settings.json'
  const path = Path.resolve(dependencies.root, relative)
  if (!(dependencies.isFile ?? isFile)(path)) {
    return
  }
  if (!/^<<<<<<< /m.test(await readText(dependencies, path))) {
    return
  }
  for (const source of ['permissions.jsonc', 'hooks.jsonc']) {
    const sourcePath = Path.resolve(dependencies.root, `.rulesync/${source}`)
    parsePermissions(await readText(dependencies, sourcePath))
    if (source === 'hooks.jsonc') {
      parseJsonc(source, await readText(dependencies, sourcePath))
    }
  }
  const scratch = await (dependencies.mkdtemp ?? defaultMkdtemp)(Path.join(Platform.tmpdir(), 'tao-agent-conflict-'))
  return Try(async () => {
    const result = await generateTarget({
      configPath: '.rulesync/rulesync.jsonc',
      features: ['permissions', 'hooks'],
      inputRoot: dependencies.root,
      outputRoots: [scratch],
      targets: ['claudecode'],
    })
    if (isRecord(result) && result.sourceLoadFailed === true) {
      Errors.ThrowUserInput(
        'Canonical harness permissions or hooks are invalid; resolve their source before regenerating settings.',
      )
    }
    await writeText(dependencies, path, await readText(dependencies, Path.resolve(scratch, relative)))
  }, {
    finally() {
      return (dependencies.remove ?? defaultRemove)(scratch)
    },
  })
}

function isBlockedAdapterOutput(error: unknown, target: ToolTarget, root: string): boolean {
  const { code, path } = error as NodeJS.ErrnoException
  if ((code !== 'EACCES' && code !== 'EPERM') || typeof path !== 'string') {
    return false
  }
  return (guardedOutputs[target] ?? []).some(output => {
    const expected = Path.resolve(root, output)
    return path === expected || path.startsWith(`${expected}/`)
  })
}

function parseJsonc(path: string, source: string): void {
  const parsed = parseConfig(path, source)
  if (!isRecord(parsed)) {
    Errors.ThrowUserInput(`Canonical harness source ${path} must contain an object.`)
  }
}

function parseConfig(path: string, source: string): unknown {
  const parsed = parseConfigFileTextToJson(path, source)
  if (parsed.error !== undefined) {
    Errors.ThrowUserInput(
      `Invalid canonical harness source ${path}: ${flattenDiagnosticMessageText(parsed.error.messageText, '\n')}`,
    )
  }
  return parsed.config
}

function reportSkip(dependencies: Dependencies, message: string): void {
  ;(dependencies.onSkip ?? IO.error)(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readText(dependencies: Dependencies, path: string): Promise<string> {
  return (dependencies.readText ?? defaultReadText)(path)
}

async function writeText(dependencies: Dependencies, path: string, content: string): Promise<void> {
  return (dependencies.writeText ?? defaultWriteText)(path, content)
}

async function defaultReadText(path: string): Promise<string> {
  return FileSystem.file(path).text()
}

async function defaultWriteText(path: string, content: string): Promise<void> {
  await FileSystem.write(path, content)
}

async function defaultMkdtemp(prefix: string): Promise<string> {
  return FileSystem.mkdtemp(prefix)
}

async function defaultRemove(path: string): Promise<void> {
  await FileSystem.rm(path, { force: true, recursive: true })
}

function isFile(path: string): boolean {
  return FileSystem.existsSync(path) && FileSystem.statSync(path).isFile()
}

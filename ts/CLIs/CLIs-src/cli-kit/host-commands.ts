import { Json } from '@shared'
import { Errors, Regxs, Try } from '@shared'
import { FS, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { runInteractiveCommand, runNonInteractiveCommand } from './cli-kit'

/** runHostCommand resolves an allowlisted operation and executes it without a shell. */
export async function runHostCommand(argv: readonly string[]): Promise<void> {
  const cwd = Repo.getWorkspaceRoot()
  const prefixes = await readHostCommandPrefixes()
  const route = resolveHostCommand(argv, prefixes)
  await Exec.requireHostProcessAccess('Invoke this operation through ./agent unsandboxed in a host-enabled harness.')
  const execute = requiresHostTerminal(argv) ? runInteractiveCommand : runNonInteractiveCommand
  await execute(route.executable, route.args, { cwd })
}

function requiresHostTerminal(argv: readonly string[]): boolean {
  return argv[0] === 'secrets' && argv[1] === 'add'
}

type HostCommandRoute = { executable: string; args: readonly string[] }

function resolveHostCommand(argv: readonly string[], prefixes: unknown): HostCommandRoute {
  if (isInvalidHostCommand(argv)) {
    Errors.ThrowUserInput('Name an allowlisted host command without leading options.')
  }
  if (argv.some(argument => typeof argument !== 'string')) {
    Errors.ThrowUserInput('Host command arguments must be strings.')
  }
  const candidates = validatedPrefixes(prefixes).filter(prefix => prefixMatches(prefix.tokens, argv))
  const matched = candidates.sort((left, right) => right.tokens.length - left.tokens.length)[0]
  if (matched === undefined) {
    Errors.ThrowUserInput(`Host command '${argv.join(' ')}' is not allowlisted.`)
  }
  return supportedRoute(matched, argv.slice(matched.tokens.length))
}

const allowlistPath = '.config/agent-host-commands.json'
const developerCommands = new Set([
  'install-ide-extension',
  'land',
  'landed',
  'merge-main',
  'setup',
  'dependency-add',
  'agent-config',
  'my-branch',
  'fmt',
  'fix',
  'check',
  'test',
  'verify',
  'doctor',
  'secrets',
])
const gitOperations = new Set(['status', 'diff', 'log', 'show', 'add', 'commit', 'fetch', 'switch', 'merge'])

type Prefix = { text: string; tokens: string[] }

async function readHostCommandPrefixes(): Promise<unknown> {
  const path = Repo.resolvePath(allowlistPath)
  const source = await FS.file(path).text()
  return Try(() => Json.Parse(source) as unknown, {
    catch() {
      Errors.ThrowUserInput(`The ${allowlistPath} file must contain a valid JSON array of command prefixes.`)
    },
  })
}

function validatedPrefixes(value: unknown): Prefix[] {
  if (!Array.isArray(value)) {
    Errors.ThrowUserInput('The agentHostCommands permission must be an array of command prefixes.')
  }
  const seen = new Set<string>()
  return value.map((prefix: unknown) => {
    if (!isValidPrefix(prefix)) {
      Errors.ThrowUserInput('Host command permission prefixes must be nonempty strings without surrounding spaces.')
    }
    const tokens = prefix.split(' ')
    if (!hasValidPrefixTokens(tokens)) {
      Errors.ThrowUserInput(`Invalid host command permission prefix '${prefix}'.`)
    }
    const key = encodePrefixIdentity(tokens)
    if (seen.has(key)) {
      Errors.ThrowUserInput(`Duplicate host command permission prefix '${prefix}'.`)
    }
    seen.add(key)
    return { text: prefix, tokens }
  })
}

function encodePrefixIdentity(tokens: readonly string[]): string {
  return Json.Print(tokens)
}

function isValidPrefix(prefix: unknown): prefix is string {
  return typeof prefix === 'string' && prefix !== '' && prefix.trim() === prefix
}

function prefixMatches(prefix: readonly string[], argv: readonly string[]): boolean {
  return prefix.every((token, index) => argv[index] === token)
}

function isInvalidHostCommand(argv: readonly string[]): boolean {
  return argv.length === 0 || typeof argv[0] !== 'string' || argv[0].startsWith('-')
}

function hasValidPrefixTokens(tokens: readonly string[]): boolean {
  return tokens.every(token => token !== '' && !Regxs.SingleWhitespaceRegx.test(token)) && !tokens[0]!.startsWith('-')
}

function supportedRoute(prefix: Prefix, trailing: readonly string[]): HostCommandRoute {
  if (prefix.text === 'push') {
    return { executable: './agent', args: ['push', ...trailing] }
  }
  if (isPerformanceOperation(prefix)) {
    return { executable: './dev', args: [...prefix.tokens, ...trailing] }
  }
  if (prefix.tokens.length === 1 && developerCommands.has(prefix.tokens[0]!)) {
    return { executable: './dev', args: [...prefix.tokens, ...trailing] }
  }
  if (prefix.text === 'local-instantdb start' || prefix.text === 'local-instantdb stop') {
    const action = prefix.tokens[1]!
    return { executable: './dev', args: [action, 'local-instantdb', ...trailing] }
  }
  if (isNativeGitPrefix(prefix)) {
    return { executable: 'git', args: [prefix.tokens[1]!, ...trailing] }
  }
  Errors.ThrowUserInput(`Host operation '${prefix.text}' is allowlisted but has no supported target.`)
}

function isPerformanceOperation(prefix: Prefix): boolean {
  return ['performance preview', 'performance modules', 'performance record'].includes(prefix.text)
}

function isNativeGitPrefix(prefix: Prefix): boolean {
  return prefix.tokens.length === 2 && prefix.tokens[0] === 'git' && gitOperations.has(prefix.tokens[1]!)
}

import { Errors, Try } from '@shared'
import { FileSystem, Platform, Repo } from '@shared/os'
import { runCommand } from './cli-kit'

const allowlistPath = '.config/agent-host-commands.json'
const developerCommands = new Set([
  'setup',
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

/** HostCommandRoute identifies a supported host command and unchanged trailing arguments. */
export type HostCommandRoute = { command: string; variadicArgs: readonly string[] }

type Prefix = { text: string; tokens: string[] }

/** runHostCommand resolves an allowlisted operation and executes it without a shell. */
export async function runHostCommand(argv: readonly string[]): Promise<void> {
  const cwd = Repo.getWorkspaceRoot()
  const prefixes = await readHostCommandPrefixes()
  const route = resolveHostCommand(argv, prefixes)
  await requireHostProcessAccess(cwd)
  await runCommand(route.command, { variadicArgs: route.variadicArgs, cwd })
}

/** resolveHostCommand applies the longest exact-token permission prefix to a supported target. */
export function resolveHostCommand(argv: readonly string[], prefixes: unknown): HostCommandRoute {
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

async function readHostCommandPrefixes(): Promise<unknown> {
  const path = Repo.resolvePath(allowlistPath)
  const source = await FileSystem.file(path).text()
  return Try(() => JSON.parse(source) as unknown, {
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
    const key = JSON.stringify(tokens)
    if (seen.has(key)) {
      Errors.ThrowUserInput(`Duplicate host command permission prefix '${prefix}'.`)
    }
    seen.add(key)
    return { text: prefix, tokens }
  })
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
  return tokens.every(token => token !== '' && !/\s/u.test(token)) && !tokens[0]!.startsWith('-')
}

function supportedRoute(prefix: Prefix, trailing: readonly string[]): HostCommandRoute {
  if (prefix.tokens.length === 1 && developerCommands.has(prefix.tokens[0]!)) {
    return { command: `./dev ${prefix.tokens[0]}`, variadicArgs: trailing }
  }
  if (prefix.text === 'local-instantdb start' || prefix.text === 'local-instantdb stop') {
    const action = prefix.tokens[1]!
    return { command: `./dev ${action} local-instantdb`, variadicArgs: trailing }
  }
  if (isNativeGitPrefix(prefix)) {
    return { command: `git ${prefix.tokens[1]}`, variadicArgs: trailing }
  }
  Errors.ThrowUserInput(`Host operation '${prefix.text}' is allowlisted but has no supported target.`)
}

function isNativeGitPrefix(prefix: Prefix): boolean {
  return prefix.tokens.length === 2 && prefix.tokens[0] === 'git' && gitOperations.has(prefix.tokens[1]!)
}

async function requireHostProcessAccess(cwd: string): Promise<void> {
  const processes = await Try(() => Platform.capture('ps -axo pid=,ppid=', { cwd }), {
    catch(error) {
      Errors.ThrowHostEnvironment(
        'Host process inspection failed; invoke this operation through `./agent unsandboxed` in a host-enabled harness.',
        { cause: error },
      )
    },
  })
  if (processes === '') {
    Errors.ThrowHostEnvironment('Host process inspection returned no processes; retry through `./agent unsandboxed`.')
  }
}

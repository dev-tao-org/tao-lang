import { Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'

export {
  activationSourceLine,
  mergeActivationSourceLine,
  readOptionalFile,
  realPathIfPresent,
  resolveZshrcTarget,
  writeFileAtomically,
}

const LEGACY_SOURCE_LINES = new Set([
  `[[ ! -r '$HOME/.tao-dev/shell/activation.zsh' ]] || source '$HOME/.tao-dev/shell/activation.zsh'`,
])

/** activationSourceLine sources Tao's per-user shell activation file. */
const activationSourceLine =
  '[[ ! -r "$HOME/.tao-dev/shell/activation.zsh" ]] || source "$HOME/.tao-dev/shell/activation.zsh"'

/** readOptionalFile reads UTF-8 content or returns an empty string when the path is missing. */
async function readOptionalFile(path: string): Promise<string> {
  return FileSystem.existsSync(path) ? await FileSystem.readFile(path, 'utf8') : ''
}

/** writeFileAtomically replaces a file through a uniquely named sibling temporary file. */
async function writeFileAtomically(path: string, content: string): Promise<void> {
  const staged = `${path}.${Platform.randomUUID()}.tmp`
  await Try(async () => {
    await FileSystem.mkdir(Path.dirname(path), { recursive: true })
    await FileSystem.writeFile(staged, content, 'utf8')
    await FileSystem.rename(staged, path)
  }, {
    finally: () => FileSystem.rm(staged, { force: true }),
  })
}

/** resolveZshrcTarget resolves an existing zsh configuration path through its symlink. */
function resolveZshrcTarget(zshrc: string): string {
  if (FileSystem.existsSync(zshrc) || isSymbolicLink(zshrc)) {
    return FileSystem.realpathSync(zshrc)
  }
  return zshrc
}

/** mergeActivationSourceLine retains one canonical Tao activation line among unrelated settings. */
function mergeActivationSourceLine(existing: string): string {
  let sourced = false
  const normalized = existing.split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (trimmed !== activationSourceLine && !LEGACY_SOURCE_LINES.has(trimmed)) {
      return [line]
    }
    if (sourced) {
      return []
    }
    sourced = true
    return [trimmed === activationSourceLine ? line : activationSourceLine]
  }).join('\n')
  if (sourced) {
    return normalized
  }
  if (!normalized || normalized.endsWith('\n')) {
    return `${normalized}${activationSourceLine}\n`
  }
  return `${normalized}\n${activationSourceLine}\n`
}

/** realPathIfPresent resolves a path when it exists and returns an empty string otherwise. */
async function realPathIfPresent(path: string): Promise<string> {
  return await Try.WithDefault('', () => FileSystem.realpathSync(path))
}

function isSymbolicLink(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isSymbolicLink())
}

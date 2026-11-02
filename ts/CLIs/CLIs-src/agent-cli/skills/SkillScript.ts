import { runNonInteractiveCommand } from '@cli-kit'
import { Errors, Try } from '@shared'
import { FileSystem, Path, Repo } from '@shared/os'

/** runSkillScript validates and runs an entry script owned by an installed skill. */
export async function runSkillScript(
  entryPath: string,
  args: readonly string[],
  workspaceRoot = Repo.getWorkspaceRoot(),
): Promise<void> {
  const root = Try.WithDefault(undefined, () => FileSystem.realpathSync(workspaceRoot))
  if (!root) {
    Errors.ThrowUserInput('The repository workspace root is unavailable.')
  }
  const script = resolveSkillScript(entryPath, root)
  await runNonInteractiveCommand('bun run', {
    variadicArgs: [script, ...args],
    cwd: root,
  })
}

function resolveSkillScript(entryPath: string, root: string): string {
  const lexicalEntry = Path.resolve(root, entryPath)
  const relative = Path.relative(root, lexicalEntry).replaceAll('\\', '/')
  const segments = relative.split('/')
  if (segments.length < 5 || segments[0] !== 'agents' || segments[1] !== 'skills' || segments[3] !== 'scripts') {
    Errors.ThrowUserInput('Skill scripts must be under agents/skills/<skill>/scripts/.')
  }
  const [skillName] = segments.slice(2, 3)
  if (!skillName || segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    Errors.ThrowUserInput('A skill script path is invalid.')
  }
  if (Path.extname(lexicalEntry) !== '.ts') {
    Errors.ThrowUserInput('Only TypeScript skill scripts are supported.')
  }
  const skillsRoot = canonicalDirectory(Path.join(root, 'agents', 'skills'))
  const skillRoot = canonicalDirectory(Path.join(skillsRoot, skillName))
  const scriptsRoot = canonicalDirectory(Path.join(skillRoot, 'scripts'))
  const canonicalEntry = canonicalFile(lexicalEntry)
  if (
    !Path.isWithin(root, skillsRoot) || !Path.isWithin(skillsRoot, skillRoot)
    || !Path.isWithin(skillRoot, scriptsRoot) || !Path.isWithin(scriptsRoot, canonicalEntry)
    || Path.extname(canonicalEntry) !== '.ts'
  ) {
    Errors.ThrowUserInput('The skill script resolves outside its skill scripts directory.')
  }
  validateSkillMarker(skillRoot, skillName)
  return canonicalEntry
}

function canonicalDirectory(path: string): string {
  const canonical = Try.WithDefault(undefined, () => FileSystem.realpathSync(path))
  if (!canonical || !Try.WithDefault(false, () => FileSystem.statSync(canonical).isDirectory())) {
    Errors.ThrowUserInput(`Expected a directory: ${path}`)
  }
  return canonical
}

function canonicalFile(path: string): string {
  const canonical = Try.WithDefault(undefined, () => FileSystem.realpathSync(path))
  if (!canonical || !Try.WithDefault(false, () => FileSystem.statSync(canonical).isFile())) {
    Errors.ThrowUserInput(`Expected a TypeScript file: ${path}`)
  }
  return canonical
}

function validateSkillMarker(skillRoot: string, skillName: string): void {
  const marker = canonicalFile(Path.join(skillRoot, 'SKILL.md'))
  if (!Path.isWithin(skillRoot, marker)) {
    Errors.ThrowUserInput('The skill marker resolves outside the skill directory.')
  }
  const contents = FileSystem.readFileSync(marker, 'utf8')
  const frontmatter = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  const name = frontmatter?.match(/^name:\s*([A-Za-z0-9_-]+)\s*$/m)?.[1]
  if (name !== skillName) {
    Errors.ThrowUserInput(`Skill marker name must match directory '${skillName}'.`)
  }
}

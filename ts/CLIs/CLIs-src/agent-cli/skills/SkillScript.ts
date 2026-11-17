import * as CLIKit from '@cli-kit'
import { Regxs, Try, UserInput } from '@shared'
import { FS, Path, Repo } from '@shared/os'

/** runSkillScript validates and runs an entry script owned by an installed skill. */
export async function runSkillScript(
  entryPath: string,
  args: readonly string[],
  workspaceRoot = Repo.getWorkspaceRoot(),
): Promise<void> {
  const root = Try.WithDefault(undefined, () => FS.realpathSync(workspaceRoot))
  UserInput.Require(!!root, 'The repository workspace root is unavailable.')
  const script = resolveSkillScript(entryPath, root)
  await CLIKit.runNonInteractiveCommand('bun', ['run', script, ...args], { cwd: root })
}

function resolveSkillScript(entryPath: string, root: string): string {
  const lexicalEntry = Path.resolve(root, entryPath)
  const relative = Path.relative(root, lexicalEntry).replaceAll('\\', '/')
  const segments = relative.split('/')
  const hasSkillPathPrefix = segments.length >= 5 && segments[0] === 'agents'
  const hasScriptsDirectory = segments[1] === 'skills' && segments[3] === 'scripts'
  const hasSkillScriptPath = hasSkillPathPrefix && hasScriptsDirectory
  UserInput.Require(!!hasSkillScriptPath, 'Skill scripts must be under agents/skills/<skill>/scripts/.')
  const [skillName] = segments.slice(2, 3)
  UserInput.Require(
    !(!skillName || segments.some(segment => segment === '' || segment === '.' || segment === '..')),
    'A skill script path is invalid.',
  )
  UserInput.Require(Path.extname(lexicalEntry) === '.ts', 'Only TypeScript skill scripts are supported.')
  const skillsRoot = canonicalDirectory(Path.join(root, 'agents', 'skills'))
  const skillRoot = canonicalDirectory(Path.join(skillsRoot, skillName))
  const scriptsRoot = canonicalDirectory(Path.join(skillRoot, 'scripts'))
  const canonicalEntry = canonicalFile(lexicalEntry)
  requireSkillScriptInsideOwnedScripts(root, skillsRoot, skillRoot, scriptsRoot, canonicalEntry)
  validateSkillMarker(skillRoot, skillName)
  return canonicalEntry
}

function requireSkillScriptInsideOwnedScripts(
  root: string,
  skillsRoot: string,
  skillRoot: string,
  scriptsRoot: string,
  canonicalEntry: string,
): void {
  const skillRootsAreNested = Path.isWithin(root, skillsRoot) && Path.isWithin(skillsRoot, skillRoot)
  const scriptsRootIsNested = Path.isWithin(skillRoot, scriptsRoot)
  const rootsAreNested = skillRootsAreNested && scriptsRootIsNested
  const entryIsInScripts = Path.isWithin(scriptsRoot, canonicalEntry) && Path.extname(canonicalEntry) === '.ts'
  UserInput.Require(
    !(!rootsAreNested || !entryIsInScripts),
    'The skill script resolves outside its skill scripts directory.',
  )
}

function canonicalDirectory(path: string): string {
  const canonical = Try.WithDefault(undefined, () => FS.realpathSync(path))
  if (!canonical || !Try.WithDefault(false, () => FS.statSync(canonical).isDirectory())) {
    UserInput.Fail(`Expected a directory: ${path}`)
  }
  return canonical
}

function canonicalFile(path: string): string {
  const canonical = Try.WithDefault(undefined, () => FS.realpathSync(path))
  if (!canonical || !Try.WithDefault(false, () => FS.statSync(canonical).isFile())) {
    UserInput.Fail(`Expected a TypeScript file: ${path}`)
  }
  return canonical
}

function validateSkillMarker(skillRoot: string, skillName: string): void {
  const marker = canonicalFile(Path.join(skillRoot, 'SKILL.md'))
  UserInput.Require(!!Path.isWithin(skillRoot, marker), 'The skill marker resolves outside the skill directory.')
  const contents = FS.readFileSync(marker, 'utf8')
  const frontmatter = Regxs.SkillFrontmatterBlockRegx.exec(contents)?.[1]
  const name = frontmatter === undefined ? undefined : Regxs.SkillFrontmatterNameRegx.exec(frontmatter)?.[1]
  if (name !== skillName) {
    UserInput.Fail(`Skill marker name must match directory '${skillName}'.`)
  }
}

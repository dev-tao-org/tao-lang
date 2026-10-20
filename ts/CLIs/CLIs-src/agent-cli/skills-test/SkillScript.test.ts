import { Try } from '@shared'
import { FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { runSkillScript } from '../skills/SkillScript'

Tests.test('runs an installed skill script with exact argv values', async () => {
  await withFixture(async root => {
    const entry = await addSkill(root)
    const args = ['has spaces', '$HOME', '$(touch nope)', '--flag']
    await runSkillScript(entry, args, root)
    Tests.expect(JSON.parse(await FileSystem.readFile(Path.join(root, 'captured.json'), 'utf8'))).toEqual({
      args,
      aliasResolved: true,
    })
  })
})

Tests.test('rejects traversal outside the skill scripts directory', async () => {
  await withFixture(async root => {
    await addSkill(root)
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/../../../../outside.ts', [], root))
  })
})

Tests.test('rejects a script symlink that escapes its scripts directory', async () => {
  await withFixture(async root => {
    const entry = await addSkill(root)
    const outside = Path.join(root, 'outside.ts')
    await FileSystem.writeFile(outside, 'void 0')
    await FileSystem.rm(entry)
    await FileSystem.symlink(outside, entry)
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.ts', [], root))
  })
})

Tests.test('rejects a skills root symlink that escapes the workspace', async () => {
  await withFixture(async root => {
    const outside = Path.join(Repo.resolvePath('.artifacts/tmp/skill-script-tests-outside'), Platform.randomUUID())
    const scripts = Path.join(outside, 'demo/scripts')
    await FileSystem.mkdir(scripts, { recursive: true })
    await FileSystem.writeFile(Path.join(outside, 'demo/SKILL.md'), '---\nname: demo\n---\n')
    await FileSystem.writeFile(Path.join(scripts, 'run.ts'), 'void 0')
    await FileSystem.mkdir(Path.join(root, 'agents'), { recursive: true })
    await Try(async () => {
      await FileSystem.symlink(outside, Path.join(root, 'agents/skills'), 'dir')
      await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.ts', [], root))
    }, { finally: () => FileSystem.rm(outside, { recursive: true, force: true }) })
  })
})

Tests.test('rejects a missing skill marker and unsupported extensions', async () => {
  await withFixture(async root => {
    const scripts = Path.join(root, 'agents/skills/demo/scripts')
    await FileSystem.mkdir(scripts, { recursive: true })
    await FileSystem.writeFile(Path.join(scripts, 'run.ts'), 'void 0')
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.ts', [], root))
    const marker = Path.join(root, 'agents/skills/demo/SKILL.md')
    await FileSystem.writeFile(marker, '---\nname: another-skill\n---\n')
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.ts', [], root))
    await FileSystem.writeFile(marker, '---\nname: demo\n---\n')
    await FileSystem.writeFile(Path.join(scripts, 'run.js'), 'void 0')
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.js', [], root))
  })
})

async function withFixture(action: (root: string) => Promise<void>): Promise<void> {
  const root = Repo.resolvePath('.artifacts/tmp/skill-script-tests', Platform.randomUUID())
  await FileSystem.mkdir(root, { recursive: true })
  await Try(() => action(root), { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
}

async function addSkill(root: string): Promise<string> {
  const scripts = Path.join(root, 'agents/skills/demo/scripts')
  await FileSystem.mkdir(scripts, { recursive: true })
  await FileSystem.writeFile(Path.join(root, 'agents/skills/demo/SKILL.md'), '---\nname: demo\n---\n')
  const entry = Path.join(scripts, 'run.ts')
  const capture = JSON.stringify(Path.join(root, 'captured.json'))
  await FileSystem.writeFile(
    entry,
    `import { Try } from '@shared'\nawait Bun.write(${capture}, JSON.stringify({ args: process.argv.slice(2), aliasResolved: typeof Try === 'function' }))\n`,
  )
  return entry
}

import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Platform, Repo } from '@shared/os'

import { runSkillScript } from '../../../CLIs-src/agent-cli/skills/SkillScript'

Tests.test('runs an installed skill script with exact argv values', async () => {
  await withFixture(async root => {
    const entry = await addSkill(root)
    const args = ['has spaces', '', 'λ', '$HOME', '$(touch nope)', '--flag', '--']
    await runSkillScript(entry, args, root)
    Tests.expect(Json.Parse(await FS.readFile(Path.join(root, 'captured.json'), 'utf8'))).toEqual({
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
    await FS.writeFile(outside, 'void 0')
    await FS.rm(entry)
    await FS.symlink(outside, entry)
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.ts', [], root))
  })
})

Tests.test('rejects a skills root symlink that escapes the workspace', async () => {
  await withFixture(async root => {
    const outside = Path.join(Repo.resolvePath('.artifacts/tmp/skill-script-tests-outside'), Platform.randomUUID())
    const scripts = Path.join(outside, 'demo/scripts')
    await FS.mkdir(scripts)
    await FS.writeFile(
      Path.join(outside, 'demo/SKILL.md'),
      Shared.joinTextLines(
        S`
          ---
          name: demo
          ---
        `,
        '',
      ),
    )
    await FS.writeFile(Path.join(scripts, 'run.ts'), 'void 0')
    await FS.mkdir(Path.join(root, 'agents'))
    await Try(async () => {
      await FS.symlink(outside, Path.join(root, 'agents/skills'), 'dir')
      await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.ts', [], root))
    }, { finally: () => FS.rm(outside, { recursive: true, force: true }) })
  })
})

Tests.test('rejects a missing skill marker and unsupported extensions', async () => {
  await withFixture(async root => {
    const scripts = Path.join(root, 'agents/skills/demo/scripts')
    await FS.mkdir(scripts)
    await FS.writeFile(Path.join(scripts, 'run.ts'), 'void 0')
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.ts', [], root))
    const marker = Path.join(root, 'agents/skills/demo/SKILL.md')
    await FS.writeFile(
      marker,
      Shared.joinTextLines(
        S`
          ---
          name: another-skill
          ---
        `,
        '',
      ),
    )
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.ts', [], root))
    await FS.writeFile(
      marker,
      Shared.joinTextLines(
        S`
          ---
          name: demo
          ---
        `,
        '',
      ),
    )
    await FS.writeFile(Path.join(scripts, 'run.js'), 'void 0')
    await Tests.rejects(runSkillScript('agents/skills/demo/scripts/run.js', [], root))
  })
})

async function withFixture(action: (root: string) => Promise<void>): Promise<void> {
  const root = Repo.resolvePath('.artifacts/tmp/skill-script-tests', Platform.randomUUID())
  await FS.mkdir(root)
  await Try(() => action(root), { finally: () => FS.rm(root, { recursive: true, force: true }) })
}

async function addSkill(root: string): Promise<string> {
  const scripts = Path.join(root, 'agents/skills/demo/scripts')
  await FS.mkdir(scripts)
  await FS.writeFile(
    Path.join(root, 'agents/skills/demo/SKILL.md'),
    Shared.joinTextLines(
      S`
        ---
        name: demo
        ---
      `,
      '',
    ),
  )
  const entry = Path.join(scripts, 'run.ts')
  const capture = Json.Print(Path.join(root, 'captured.json'))
  await FS.mkdir(Path.join(root, 'ts'))
  await FS.writeFile(
    Path.join(root, 'ts/tsconfig.json'),
    Json.Print({ extends: Repo.resolvePath('ts/tsconfig.base.json') }),
  )
  await FS.writeFile(
    entry,
    Shared.joinTextLines(
      S`
        import { main } from '../../../../ts/implementation'
        await main()
      `,
      '',
    ),
  )
  await FS.writeFile(
    Path.join(root, 'ts/implementation.ts'),
    Shared.joinTextLines(
      S`
            import { Try } from '@shared'
            import { FS, Process } from '@shared/os'
            export async function main() { await FS.writeFile(${capture}, JSON.stringify({ args: Process.argv.slice(2), aliasResolved: typeof Try === 'function' })) }
      `,
      '',
    ),
  )
  return entry
}

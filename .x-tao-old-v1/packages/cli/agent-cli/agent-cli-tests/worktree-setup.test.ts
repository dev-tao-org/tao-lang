import { CLI, FS, Repo } from '@shared'
import { Describe, Expect, mkTestDir, Test } from '@shared/test'

Describe('worktree setup hook', () => {
  Test('direct invocation enters its checkout and propagates locked root setup failure', async () => {
    const base = await mkTestDir('tao-worktree-setup-')
    try {
      const root = FS.resolvePath("checkout with ' quote", base)
      const hook = FS.resolvePath('.cursor/worktree-setup.sh', root)
      await FS.writeText(hook, await FS.readText(Repo.resolveGitPath('.cursor/worktree-setup.sh')), { mode: 0o755 })
      await FS.writeText(
        FS.resolvePath('agent', root),
        `#!/bin/sh
printf '%s\\n' "$PWD" "$@"
exit 23
`,
        { mode: 0o755 },
      )
      const result = await CLI.run(hook, {
        cwd: base,
        env: { PATH: '/usr/bin:/bin' },
      })
      Expect(result.stdout.trim().split('\n')).toEqual([
        await FS.realPath(root),
        'setup',
        '--frozen-lockfile',
      ])
      Expect(result.stderr).toBe('')
      Expect(result.exitCode).toBe(23)
    } finally {
      await FS.remove(base)
    }
  })
})

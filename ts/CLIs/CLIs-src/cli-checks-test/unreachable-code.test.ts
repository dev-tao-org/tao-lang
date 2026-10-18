import { FileSystem, Repo, Tests } from '@shared/os'

Tests.test('workspace compiler config rejects unreachable code', async () => {
  const base = JSON.parse(await FileSystem.file(Repo.resolvePath('ts/tsconfig.base.json')).text()) as {
    compilerOptions: { allowUnreachableCode?: boolean }
  }
  Tests.expect(base.compilerOptions.allowUnreachableCode).toBe(false)
})

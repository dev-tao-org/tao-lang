import { Json } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Repo } from '@shared/os'

Tests.test('workspace compiler config rejects unreachable code', async () => {
  const base = Json.Parse(await FS.file(Repo.resolvePath('ts/tsconfig.base.json')).text()) as {
    compilerOptions: { allowUnreachableCode?: boolean }
  }
  Tests.expect(base.compilerOptions.allowUnreachableCode).toBe(false)
})

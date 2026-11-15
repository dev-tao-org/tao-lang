import '../../cli-kit/fatal-errors'
import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { NewlineCharacter } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { prepareNativeLocks } from '../../cli-checks/native-lock-build'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { setupStorage } from '../SetupStorage'
import { runDirenvSetup } from '../shell/DirenvSetup'

await CLIKit.configureCLIOutput('agent')
await setupStorage()
await prepareParser()
await prepareNativeLocks()
await prepareRuntime()
await ensureShellCompletionCache()
await runDirenvSetup({ prepare: true })
await IO.finish()

async function ensureShellCompletionCache(): Promise<void> {
  const cache = Repo.resolvePath('.artifacts/cache/dev-shell')
  const completion = Path.resolve(cache, 'completion.zsh')
  if (FS.existsSync(completion)) {
    return
  }
  await FS.mkdir(cache)
  await FS.writeFile(
    completion,
    '# Tao dev shell completion is generated during ./agent unsandboxed setup.' + NewlineCharacter,
    'utf8',
  )
}

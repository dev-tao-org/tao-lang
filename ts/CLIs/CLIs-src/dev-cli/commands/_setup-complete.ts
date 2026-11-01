import '../../cli-kit/fatal-errors'
import { configureCLIOutput, IO } from '@cli-kit'
import { FileSystem, Path, Repo } from '@shared/os'
import { prepareNativeLocks } from '../../cli-checks/native-lock-build'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { setupStorage } from '../SetupStorage'
import { runDirenvSetup } from '../shell/DirenvSetup'

await configureCLIOutput('agent')
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
  if (FileSystem.existsSync(completion)) {
    return
  }
  await FileSystem.mkdir(cache)
  await FileSystem.writeFile(
    completion,
    '# Tao dev shell completion is generated during ./agent setup.\n',
    'utf8',
  )
}

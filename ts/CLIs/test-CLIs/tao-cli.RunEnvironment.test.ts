import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import * as Workspace from '@workspace'

Tests.test.skipIf(Platform.systemInfo().os === 'Windows_NT')(
  'noninteractive runs suppress eager native DevTools without changing the Expo watch setting',
  async () => {
    const directory = Artifacts.resolvePath('tmp', `expo-launch-${Platform.randomUUID()}`)
    const receipt = Path.join(directory, 'launch.json')
    await Try(async () => {
      await writeRecordingConsumer(directory, receipt)
      await Exec.captureStdout(Repo.resolvePath('tao'), ['run', '--package', directory, '--web'], {
        cwd: directory,
        addEnv: { EXPO_UNSTABLE_HEADLESS: '0', CI: '0' },
        timeoutMs: 5000,
      })
      const launch = parseExpoLaunchReceipt(await FS.readFile(receipt, 'utf8'))
      Tests.expect(launch).toEqual({ headless: '1', ci: '0', args: ['start', '--localhost', '--web'] })
    }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
  },
)

async function writeRecordingConsumer(directory: string, receipt: string): Promise<void> {
  await Workspace.initializeProject(directory)
  await FS.mkdirs(Path.join(directory, 'node_modules/.bin'), Path.join(directory, 'node_modules/expo'))
  await FS.writeFile(
    Path.join(directory, 'package.json'),
    '{"name":"expo-launch-fixture","tao":{"run":{"entry":"Consumer.tsx"}}}',
  )
  await FS.writeFile(Path.join(directory, 'Consumer.tsx'), 'export default function App() { return null }')
  const recorder = S`
    #!/usr/bin/env bun
    const launch = {
      headless: process.env.EXPO_UNSTABLE_HEADLESS,
      ci: process.env.CI,
      args: process.argv.slice(2),
    };
    await Bun.write(${Json.Print(receipt)}, JSON.stringify(launch));
  `
  await FS.writeFile(Path.join(directory, 'node_modules/.bin/expo'), recorder, { mode: 0o755 })
}

type ExpoLaunchReceipt = { headless: string; ci: string; args: string[] }

function parseExpoLaunchReceipt(source: string): ExpoLaunchReceipt {
  return Json.Parse(source) as ExpoLaunchReceipt
}

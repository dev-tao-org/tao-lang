import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { initializeProject } from '@workspace/projects/Projects'

Tests.test.skipIf(Platform.systemInfo().os === 'Windows_NT')(
  'noninteractive runs suppress eager native DevTools without changing the Expo watch setting',
  async () => {
    const directory = Artifacts.resolvePath('tmp', `expo-launch-${Platform.randomUUID()}`)
    const receipt = Path.join(directory, 'launch.json')
    await Try(async () => {
      await writeRecordingConsumer(directory, receipt)
      await Platform.capture(Repo.resolvePath('tao'), {
        variadicArgs: ['run', '--package', directory, '--web'],
        cwd: directory,
        addEnv: { EXPO_UNSTABLE_HEADLESS: '0', CI: '0' },
        timeoutMs: 5000,
      })
      const launch = parseExpoLaunchReceipt(await FileSystem.readFile(receipt, 'utf8'))
      Tests.expect(launch).toEqual({ headless: '1', ci: '0', args: ['start', '--localhost', '--web'] })
    }, { finally: () => FileSystem.rm(directory, { recursive: true, force: true }) })
  },
)

async function writeRecordingConsumer(directory: string, receipt: string): Promise<void> {
  await initializeProject(directory)
  await FileSystem.mkdirs(Path.join(directory, 'node_modules/.bin'), Path.join(directory, 'node_modules/expo'))
  await FileSystem.writeFile(
    Path.join(directory, 'package.json'),
    '{"name":"expo-launch-fixture","tao":{"run":{"entry":"Consumer.tsx"}}}',
  )
  await FileSystem.writeFile(Path.join(directory, 'Consumer.tsx'), 'export default function App() { return null }')
  const recorder = S`
    #!/usr/bin/env bun
    const launch = {
      headless: process.env.EXPO_UNSTABLE_HEADLESS,
      ci: process.env.CI,
      args: process.argv.slice(2),
    };
    await Bun.write(${JSON.stringify(receipt)}, JSON.stringify(launch));
  `
  await FileSystem.writeFile(Path.join(directory, 'node_modules/.bin/expo'), recorder, { mode: 0o755 })
}

type ExpoLaunchReceipt = { headless: string; ci: string; args: string[] }

function parseExpoLaunchReceipt(source: string): ExpoLaunchReceipt {
  return JSON.parse(source) as ExpoLaunchReceipt
}

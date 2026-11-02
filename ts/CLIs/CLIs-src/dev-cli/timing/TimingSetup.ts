import { IO, runInteractiveCommand, runNonInteractiveCommand } from '@cli-kit'
import { Errors } from '@shared'
import { FileSystem, Path, Platform, Storage, Terminal } from '@shared/os'

/** TimingSetup selects a CLI-only network role and optional setup preview. */
export type TimingSetup = { role: 'controller' | 'runner'; dryRun?: boolean; noBrowser?: boolean }

/** TimingSetupIO supplies the native installation boundary without mutating machines in tests. */
export type TimingSetupIO = {
  platform: string
  interactive: boolean
  capture: typeof Platform.capture
  resolveExecutable: () => Promise<string>
  execute: typeof runNonInteractiveCommand
  executeInteractive: typeof runInteractiveCommand
  exists: typeof FileSystem.exists
  mkdir: (path: string) => Promise<void>
  print: (message: string) => void
  packageRoot: string
}

/** setupTiming installs the pinned NetBird service, retains its Nix package and starts ordinary browser login. */
export async function setupTiming(options: TimingSetup, io = createSetupIO()): Promise<void> {
  if (io.platform !== 'Darwin') {
    Errors.ThrowUserInput('Timing network setup currently supports macOS.')
  }
  const executable = await io.resolveExecutable()
  const packageDirectory = Path.dirname(Path.dirname(executable))
  if (!packageDirectory.startsWith('/nix/store/')) {
    Errors.ThrowHostEnvironment('Run setup through this checkout’s pinned Nix environment.')
  }
  const installed = await io.exists(NetBirdService)
  if (installed) {
    await requireMatchingService(io, executable)
  }
  const hostname = options.role === 'runner' ? 'tao-timing' : 'tao-controller'
  if (options.dryRun) {
    io.print(`Would retain ${packageDirectory}, install/start the NetBird system service and sign in as ${hostname}.`)
    return
  }
  if (!io.interactive) {
    Errors.ThrowUserInput(
      `Run just timing-setup-${options.role} in Terminal for administrator authorization and login.`,
    )
  }
  await retainPackage(io, packageDirectory)
  const executeService = (action: string) =>
    io.executeInteractive('sudo env', {
      variadicArgs: [`PATH=${Path.dirname(executable)}`, 'netbird', 'service', action],
    })
  if (!installed) {
    await executeService('install')
  }
  await executeService('start')
  await io.executeInteractive('netbird up', {
    variadicArgs: ['--hostname', hostname, ...options.noBrowser ? ['--no-browser'] : []],
  })
  await io.execute('netbird status')
  printRoleInstructions(options.role, io.print)
}

const NetBirdService = '/Library/LaunchDaemons/netbird.plist'

function createSetupIO(): TimingSetupIO {
  return {
    platform: Platform.systemInfo().os,
    interactive: Terminal.isInteractive(),
    capture: Platform.capture,
    resolveExecutable: async () => await FileSystem.realpath(await Platform.capture('which netbird')),
    execute: runNonInteractiveCommand,
    executeInteractive: runInteractiveCommand,
    exists: FileSystem.exists,
    async mkdir(path) {
      await FileSystem.mkdir(path, { recursive: true })
    },
    print: IO.print,
    packageRoot: Storage.resolveSupportDirectory('timing', 'netbird-package'),
  }
}

async function requireMatchingService(io: TimingSetupIO, executable: string): Promise<void> {
  const installed = await io.capture('plutil -extract ProgramArguments.0 raw -o -', {
    variadicArgs: [NetBirdService],
  })
  if (installed !== executable) {
    Errors.ThrowHostEnvironment(
      'The existing NetBird service uses a different executable. Keep its current owner; do not install a second service.',
    )
  }
}

async function retainPackage(io: TimingSetupIO, packageDirectory: string): Promise<void> {
  await io.mkdir(Path.dirname(io.packageRoot))
  await io.execute('nix-store', {
    variadicArgs: ['--realise', packageDirectory, '--add-root', io.packageRoot, '--indirect'],
  })
}

function printRoleInstructions(role: TimingSetup['role'], print: TimingSetupIO['print']): void {
  print(
    'Sign in to the same NetBird account on both Macs. The CLI daemon reconnects at boot; no GUI login item is needed.',
  )
  if (role === 'runner') {
    print('Enable System Settings → General → Sharing → Remote Login for your existing macOS user.')
    print('Keep the runner awake on AC power. Use the actual private DNS name shown by netbird status.')
  } else {
    print('Next: just timing-connect ro@tao-timing.netbird.cloud (replace with the runner’s actual DNS name).')
  }
}

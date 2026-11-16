import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Errors, Regxs } from '@shared'
import { FS, Path, Platform, Storage, Terminal } from '@shared/os'
import { Http } from '@shared/web'

/** installTailscale installs the official standalone macOS package without replacing an existing app variant. */
export async function installTailscale(dryRun: boolean): Promise<void> {
  const io = createSystemInstallIO()
  if (io.platform !== 'Darwin') {
    Errors.ThrowUserInput(
      'tailscale-install currently supports macOS. See https://tailscale.com/docs/install for other systems.',
    )
  }
  if (await io.exists(TailscaleApp)) {
    io.print('Tailscale is already installed; keeping the existing app. Open it to sign in or connect.')
    printNextSteps(io.print)
    return
  }
  const packageName = selectStablePackage(await io.readIndex())
  const packageUrl = PackageIndex + packageName
  if (dryRun) {
    io.print(
      `Would download ${packageUrl}, verify its package signature, then install with macOS administrator authorization.`,
    )
    return
  }
  if (!io.interactive) {
    Errors.ThrowUserInput(
      'Run just tailscale-install in an interactive terminal for macOS administrator authorization.',
    )
  }
  const directory = Storage.resolveCacheDirectory('downloads', 'tailscale', Platform.randomUUID())
  await FS.mkdir(directory)
  const path = Path.join(directory, packageName)
  io.progress('Downloading Tailscale from its official stable package server…')
  await io.execute('curl', ['--fail', '--location', '--proto', '=https', '--tlsv1.2', '--output', path, packageUrl])
  io.progress('Verifying the macOS installer signature…')
  await io.execute('pkgutil', ['--check-signature', path])
  io.progress('Installing Tailscale; macOS may request your administrator password…')
  await io.executeInteractive('sudo', ['installer', '-pkg', path, '-target', '/'])
  io.print('Tailscale installed.')
  printNextSteps(io.print)
}

type InstallIO = {
  platform: string
  interactive: boolean
  exists: (path: string) => Promise<boolean>
  readIndex: () => Promise<string>
  execute: typeof CLIKit.runNonInteractiveCommand
  executeInteractive: typeof CLIKit.runInteractiveCommand
  print: (message: string) => void
  progress: (message: string) => void
}

const PackageIndex = 'https://pkgs.tailscale.com/stable/'
const TailscaleApp = '/Applications/Tailscale.app'

function createSystemInstallIO(): InstallIO {
  return {
    platform: Platform.systemInfo().os,
    interactive: Terminal.isInteractive(),
    exists: FS.exists,
    async readIndex() {
      const response = await Http.request(PackageIndex)
      if (!response.ok) {
        Errors.ThrowHostEnvironment(`Cannot read Tailscale stable packages: HTTP ${response.status}.`)
      }
      return await response.text()
    },
    execute: CLIKit.runNonInteractiveCommand,
    executeInteractive: CLIKit.runInteractiveCommand,
    print: IO.print,
    progress: IO.progress,
  }
}

function selectStablePackage(source: string): string {
  const name = source.match(Regxs.TailscaleStablePackageLinkRegx)?.[1]
  return name ?? Errors.ThrowHostEnvironment('The official stable package page did not identify a macOS installer.')
}

function printNextSteps(print: (message: string) => void): void {
  print(
    'Open Tailscale from Applications, approve its macOS VPN/system-extension prompts, and sign in to the same account on both Macs.',
  )
  print('For SSH on the timing Mac: System Settings → General → Sharing → Remote Login; allow your existing user.')
  print(
    'Tailscale provides the private network; existing SSH authentication still applies. No Tao-specific credentials are created.',
  )
  print(
    'Keep the timing Mac awake on power and logged in with the screen locked. Send its Tailscale name or IP when ready.',
  )
}

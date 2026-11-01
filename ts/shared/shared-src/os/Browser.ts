import { Errors, Switch } from '@shared'
import { Platform } from '@shared/os'

/** build bundles browser entry points for a local tooling surface. */
export async function build(entrypoints: string[], outdir: string): Promise<Bun.BuildOutput> {
  return await Bun.build({ entrypoints, outdir, target: 'browser', format: 'esm', sourcemap: 'none' })
}

/** openUrl opens a web URL in Google Chrome without activating it on macOS. */
export async function openUrl(url: string, host: BrowserHost = nativeBrowser()): Promise<void> {
  if (host.os === 'Darwin') {
    await host.requireAccess('Run just dev in a normal terminal or a host-enabled harness; the browser was not opened.')
  }
  const status = await host.start(browserCommand(url, host.os))
  if (status !== 0) {
    Errors.ThrowHostEnvironment(`Could not open the preview URL in Google Chrome: ${url}`)
  }
}

type BrowserHost = {
  os: string
  requireAccess: (hint: string) => Promise<void>
  start: (command: readonly string[]) => Promise<number>
}

function nativeBrowser(): BrowserHost {
  return {
    os: Platform.systemInfo().os,
    requireAccess: Platform.requireHostProcessAccess,
    async start(command) {
      const child = Platform.spawnSilent(command)
      return await child.exited
    },
  }
}

function browserCommand(url: string, os: string): string[] {
  if (!Platform.isSupportedHostSystem(os)) {
    Errors.ThrowHostEnvironment(`Opening a browser is unsupported on ${os}.`)
  }
  return Switch<Platform.HostSystem, string[]>(os, {
    Darwin: () => ['open', '-g', '-a', 'Google Chrome', url],
    Linux: () => ['google-chrome', url],
    Windows_NT: () => ['cmd', '/c', 'start', '', 'chrome', url],
  })
}

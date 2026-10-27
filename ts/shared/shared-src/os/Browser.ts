import { Errors } from '@shared'
import { Platform } from '@shared/os'
import * as BunHost from './bridges/Bridge_bun/Bridge_bun'

/** build bundles browser entry points for a local tooling surface. */
export async function build(entrypoints: string[], outdir: string): Promise<BunHost.BuildOutput> {
  return await BunHost.getRuntime().build({ entrypoints, outdir, target: 'browser', format: 'esm', sourcemap: 'none' })
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
      const child = Platform.spawn(command, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' })
      return await child.exited
    },
  }
}

function browserCommand(url: string, os: string): string[] {
  if (os === 'Darwin') {
    return ['open', '-g', '-a', 'Google Chrome', url]
  }
  if (os === 'Linux') {
    return ['google-chrome', url]
  }
  if (os === 'Windows_NT') {
    return ['cmd', '/c', 'start', '', 'chrome', url]
  }
  return Errors.ThrowHostEnvironment(`Opening a browser is unsupported on ${os}.`)
}

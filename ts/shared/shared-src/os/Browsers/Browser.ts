import { Errors, Switch } from '@shared'
import { Platform } from '@shared/os'
import * as BunHost from '../bridges/Bridge_bun/Bridge_bun'
import Exec, { type CommandInvocation } from '../Exec'

/** build bundles browser entry points for a local tooling surface. */
export async function build(entrypoints: string[], outdir: string): Promise<BunHost.BuildOutput> {
  return await BunHost.getRuntime().build({ entrypoints, outdir, target: 'browser', format: 'esm', sourcemap: 'none' })
}

/** openUrl opens a web URL in Google Chrome without activating it on macOS. */
export async function openUrl(url: string): Promise<void> {
  const os = Platform.systemInfo().os
  if (os === 'Darwin') {
    await Exec.requireHostProcessAccess(
      'Run just dev in a normal terminal or a host-enabled harness; the browser was not opened.',
    )
  }
  const { command, args } = resolveBrowserInvocation(url, os)
  const child = Exec.spawn(command, args, { stdout: 'ignore', stderr: 'ignore' })
  child.unref()
  if (await child.exited !== 0) {
    Errors.ThrowHostEnvironment(`Could not open the preview URL in Google Chrome: ${url}`)
  }
}

function resolveBrowserInvocation(url: string, os: string): CommandInvocation {
  if (!Platform.isSupportedHostSystem(os)) {
    Errors.ThrowHostEnvironment(`Opening a browser is unsupported on ${os}.`)
  }
  return Switch<Platform.HostSystem, CommandInvocation>(os, {
    Darwin: () => ({ command: 'open', args: ['-g', '-a', 'Google Chrome', url] }),
    Linux: () => ({ command: 'google-chrome', args: [url] }),
    Windows_NT: () => ({ command: 'cmd', args: ['/c', 'start', '', 'chrome', url] }),
  })
}

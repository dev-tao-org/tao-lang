import { Errors } from '@shared'
import { Platform } from '@shared/os'

/** build bundles browser entry points for a local tooling surface. */
export async function build(entrypoints: string[], outdir: string): Promise<Bun.BuildOutput> {
  return await Bun.build({ entrypoints, outdir, target: 'browser', format: 'esm', sourcemap: 'none' })
}

/** openUrl opens a URL in the user's default browser. */
export async function openUrl(url: string): Promise<void> {
  const child = Platform.spawn(browserCommand(url), { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' })
  const status = await child.exited
  if (status !== 0) {
    Errors.ThrowHostEnvironment(`Could not open the preview URL in the default browser: ${url}`)
  }
}

function browserCommand(url: string): string[] {
  const os = Platform.systemInfo().os
  if (os === 'Darwin') {
    return ['open', '-g', url]
  }
  if (os === 'Linux') {
    return ['xdg-open', url]
  }
  if (os === 'Windows_NT') {
    return ['cmd', '/c', 'start', '', url]
  }
  return Errors.ThrowHostEnvironment(`Opening a browser is unsupported on ${os}.`)
}

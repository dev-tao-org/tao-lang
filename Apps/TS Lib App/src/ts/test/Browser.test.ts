import { expect, test } from 'bun:test'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { verifyConsumer } from './ConsumerJourney'

type TaoTestSourceMarker = {
  kind: 'tao-isolated-consumer-fixture'
  packageDirectory: string
}

test('Tao library renders React props, children and isolated instances', async () => {
  const reservation = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = reservation.port!
  reservation.stop(true)
  const url = `http://localhost:${port}`
  const packageRoot = fileURLToPath(new NodeURL('..', import.meta.url).href)
  const shouldRefreshSource = process.env.TAO_TEST_SOURCE_REFRESH === '1'
  const server = startTaoHost(packageRoot, port, shouldRefreshSource)
  const stdout = new Response(server.stdout).text()
  const stderr = new Response(server.stderr).text()
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    await waitForServer(url, server)
    browser = await chromium.launch({ headless: true, channel: 'chrome' })
    const page = await browser.newPage({ hasTouch: true })
    await page.goto(url)
    await verifyConsumer(page)
    if (shouldRefreshSource) {
      await verifyIsolatedSourceRefresh(page, packageRoot)
    }
  } finally {
    await browser?.close()
    server.kill('SIGINT')
    await server.exited
    const output = (await stdout) + (await stderr)
    const logDirectory = new NodeURL('../../../.tao/cache/tests/', import.meta.url)
    await mkdir(fileURLToPath(logDirectory), { recursive: true })
    await Bun.write(fileURLToPath(new NodeURL(`browser-${port}.log`, logDirectory)), output)
  }
}, 90_000)

function startTaoHost(packageRoot: string, port: number, shouldRefreshSource: boolean): Bun.ReadableSubprocess {
  const childEnvironment: Record<string, string | undefined> = {
    ...process.env,
    BROWSER: 'none',
    EXPO_NO_TELEMETRY: '1',
    NODE_ENV: 'development',
  }
  if (shouldRefreshSource) {
    delete childEnvironment.CI
  } else {
    childEnvironment.CI = '1'
  }
  const tao = process.env.TAO_CLI ?? 'tao'
  return Bun.spawn([
    tao,
    'run',
    '--package',
    packageRoot,
    '--session',
    `browser-${port}`,
    '--port',
    String(port),
    '--web',
  ], {
    cwd: packageRoot,
    env: childEnvironment,
    stdout: 'pipe',
    stderr: 'pipe',
  })
}

async function verifyIsolatedSourceRefresh(page: Page, packageRoot: string): Promise<void> {
  await requireIsolatedSourceMarker(packageRoot)
  const sourcePath = join(packageRoot, 'Consumer.tsx')
  const originalSource = await readFile(sourcePath, 'utf8')
  const originalTitle = 'TS Lib App'
  const refreshedTitle = 'TS Lib App refreshed'
  const refreshedSource = originalSource.replace(`>${originalTitle}</Text>`, `>${refreshedTitle}</Text>`)
  expect(refreshedSource).not.toBe(originalSource)
  try {
    await writeFile(sourcePath, refreshedSource)
    await page.getByText(refreshedTitle, { exact: true }).waitFor()
  } finally {
    await writeFile(sourcePath, originalSource)
  }
}

async function requireIsolatedSourceMarker(packageRoot: string): Promise<void> {
  const markerPath = join(packageRoot, '.tao-test-source.json')
  const marker = JSON.parse(await readFile(markerPath, 'utf8')) as TaoTestSourceMarker
  const packageDirectory = await realpath(packageRoot)
  expect(marker.kind).toBe('tao-isolated-consumer-fixture')
  expect(marker.packageDirectory).toBe(packageDirectory)
}

async function waitForServer(url: string, server: Bun.ReadableSubprocess): Promise<void> {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error('Expo stopped before becoming ready.')
    }
    try {
      if ((await fetch(url)).ok) {
        return
      }
    } catch {
      // Readiness waits only for this test's owned HTTP server.
    }
    await Bun.sleep(100)
  }
  throw new Error('Expo did not become ready at ' + url)
}

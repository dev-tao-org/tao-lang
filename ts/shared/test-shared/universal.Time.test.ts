import { Json, S, Time } from '@shared'
import * as Tests from '@shared-tests'
import { Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import * as Process from '../shared-src/os/Process'

Tests.test('waitFor preserves explicit success values and bounds periodic checks without real sleeps', async () => {
  const zero = await Time.waitFor(success => success(0), { timeout: 0 })
  const disabled = await Time.waitFor(success => success(false), { timeout: 0 })
  const empty = await Time.waitFor(success => success(new Map<string, number>()), { timeout: 0 })
  Tests.expect(zero).toBe(0)
  Tests.expect(disabled).toBe(false)
  Tests.expect(empty?.size).toBe(0)
  const timePath = Repo.resolvePath('ts/shared/shared-src/universal/Time.ts')
  const timeUrl = Path.pathToFileURL(timePath).href
  const script = createWaitProbe(timeUrl)
  const result = await Exec.capture(Process.argv[0], ['-e', script])
  Tests.expect(Json.Parse(result.stdout)).toEqual({
    ready: 'ready',
    readyChecks: 3,
    readyDelays: [25, 25],
    timedOut: true,
    timeoutChecks: 2,
    timeoutDelays: [40, 20],
    immediateChecks: 1,
    immediateDelays: [],
    preservedFailure: true,
  })
})

function createWaitProbe(timeUrl: string): string {
  return S`
    let now = 0; let delays = [];
    Object.defineProperty(globalThis, 'performance', { value: { timeOrigin: 0, now: () => now } });
    globalThis.setTimeout = (action, delay) => { delays.push(delay); now += delay; action(); return 1; };
    const Time = await import(${Json.Print(timeUrl)});
    let readyChecks = 0;
    const ready = await Time.waitFor(success => ++readyChecks === 3 ? success('ready') : undefined, { timeout: 100 });
    const readyDelays = [...delays]; delays = []; now = 0;
    let timeoutChecks = 0;
    const timeout = await Time.waitFor(() => { timeoutChecks++; }, { timeout: 60, interval: 40 });
    const timeoutDelays = [...delays]; delays = []; now = 0;
    let immediateChecks = 0;
    await Time.waitFor(() => { immediateChecks++; }, { timeout: 0 });
    const failure = new Error('probe failed');
    const preservedFailure = await Time.waitFor(() => { throw failure; }, { timeout: 100 })
      .then(() => false, error => error === failure);
    process.stdout.write(JSON.stringify({ ready, readyChecks, readyDelays, timedOut: timeout === undefined,
      timeoutChecks, timeoutDelays, immediateChecks, immediateDelays: delays, preservedFailure }));
  `
}

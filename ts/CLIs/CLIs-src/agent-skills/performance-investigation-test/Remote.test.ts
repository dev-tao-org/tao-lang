import { Tests } from '@shared/os'
import { executeRemote } from '../performance-investigation/Remote'

Tests.test('remote execution quotes each argument and retains background job output', async () => {
  const commands: string[][] = []
  const execute = async (_command: unknown, options: { variadicArgs?: readonly string[] } = {}) => {
    commands.push([...(options.variadicArgs ?? [])])
  }
  await executeRemote(
    'fixture-host',
    ["a'b", '$(touch surprise)', 'two words'],
    '/Users/ro/Timing Runs',
    undefined,
    execute,
  )
  Tests.expect(commands[0].at(-1))
    .toBe("cd '/Users/ro/Timing Runs' && exec 'a'\\''b' '$(touch surprise)' 'two words'")
  await executeRemote('fixture-host', ['./agent', 'performance', 'preview'], '/Users/ro/tao', '/tmp/job.log', execute)
  const detached = commands[1].at(-1)!
  Tests.expect(detached).toContain("cd '/Users/ro/tao' || exit")
  Tests.expect(detached).toContain("nohup './agent' 'performance' 'preview' > '/tmp/job.log' 2>&1 < /dev/null &")
})

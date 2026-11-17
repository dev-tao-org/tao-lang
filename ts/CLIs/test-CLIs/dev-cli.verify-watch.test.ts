import { Errors, Json } from '@shared'
import * as Tests from '@shared-tests'
import { watchVerifyRun } from '../CLIs-src/dev-cli/commands/VerifyWatch'

Tests.test('Verify watching makes one conditional request per five-second poll and stops at success', async () => {
  const requests: (readonly string[])[] = []
  const intervals: number[] = []
  const messages: string[] = []
  const replies = [
    { status: 0, stdout: runReply('in_progress', null, 'Etag: W/"first"\r\n') },
    { status: 1, stdout: 'HTTP/2 304 Not Modified\n\r\n' },
    { status: 0, stdout: runReply('completed', 'success') },
  ]
  await watchVerifyRun('/repo', '42', {
    expectedHead: 'expected',
    dependencies: {
      async capture(command, args, options) {
        const reply = replies.shift() ?? Errors.ThrowShouldNeverHappen('Unexpected extra poll.')
        requests.push(args)
        Tests.expect(command).toBe('gh')
        Tests.expect(options.check).toBe(false)
        return { command, args, ...reply, signal: null, stderr: '' }
      },
      print: message => messages.push(message),
      async sleep(milliseconds) {
        intervals.push(milliseconds)
      },
    },
  })
  const endpoint = 'repos/dev-tao-org/tao-lang/actions/runs/42?exclude_pull_requests=true'
  const api = ['api', '--hostname', 'github.com', '--include']
  const conditional = [...api, '--header', 'If-None-Match: W/"first"', endpoint]
  Tests.expect(requests).toEqual([[...api, endpoint], conditional, conditional])
  Tests.expect(intervals).toEqual([5000, 5000])
  Tests.expect(messages).toEqual([
    'Run 42 (in_progress) https://github.com/dev-tao-org/tao-lang/actions/runs/42',
    'Run 42 (success) https://github.com/dev-tao-org/tao-lang/actions/runs/42',
  ])
})

Tests.test('Verify watching reports a cancelled run without another poll', async () => {
  await Tests.expect(watchVerifyRun('/repo', '42', {
    dependencies: {
      capture: async (command, args) => ({
        command,
        args,
        status: 0,
        signal: null,
        stdout: runReply('completed', 'cancelled'),
        stderr: '',
      }),
      print() {},
      async sleep() {
        Errors.ThrowShouldNeverHappen('A completed run is final.')
      },
    },
  })).rejects.toThrow('GitHub Actions run 42 completed with cancelled.')
})

Tests.test('a successful hosted run cannot satisfy verification for another commit', async () => {
  await Tests.expect(watchVerifyRun('/repo', '42', {
    expectedHead: 'different',
    dependencies: {
      capture: async (command, args) => ({
        command,
        args,
        status: 0,
        signal: null,
        stdout: runReply('completed', 'success'),
        stderr: '',
      }),
      print() {},
      async sleep() {
        Errors.ThrowShouldNeverHappen('A different source must stop verification.')
      },
    },
  })).rejects.toThrow('GitHub Actions run 42 is for expected, expected different.')
})

type RunConclusion = string | null

function runReply(status: string, conclusion: RunConclusion, headers = ''): string {
  const body = Json.Print({
    head_sha: 'expected',
    status,
    conclusion,
    html_url: 'https://github.com/dev-tao-org/tao-lang/actions/runs/42',
  })
  return `HTTP/2 200 OK\n${headers}\r\n${body}`
}

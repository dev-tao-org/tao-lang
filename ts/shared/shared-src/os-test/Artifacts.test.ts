import { Artifacts, Test } from '@shared/os'

Test.test('partial cleanup expires successful output after 24 hours and preserves unfinished or failed evidence', () => {
  const day = 24 * 60 * 60 * 1000
  Test.expect(Artifacts.expiredTemporaryArtifacts([
    { status: 'succeeded', completedAt: day, artifacts: ['expired'] },
    { status: 'succeeded', completedAt: day + 1, artifacts: ['recent'] },
    { status: 'succeeded', artifacts: ['no-completion-time'] },
    { status: 'failed', completedAt: 0, artifacts: ['failure'] },
    { status: 'running', artifacts: ['active'] },
  ], day * 2)).toEqual(['expired'])
})

Test.test('partial cleanup protects shared output retained by another run and removes duplicate candidates once', () => {
  const day = 24 * 60 * 60 * 1000
  Test.expect(Artifacts.expiredTemporaryArtifacts([
    { status: 'succeeded', completedAt: 0, artifacts: ['shared', 'old', 'old'] },
    { status: 'failed', completedAt: 1, artifacts: ['shared'] },
  ], day)).toEqual(['old'])
  Test.expect(Artifacts.expiredTemporaryArtifacts([
    { status: 'succeeded', completedAt: 0, artifacts: ['logs/session', 'scratch/run/old.txt'] },
    { status: 'running', artifacts: ['logs/session/active.log', 'scratch/run'] },
  ], day)).toEqual([])
})

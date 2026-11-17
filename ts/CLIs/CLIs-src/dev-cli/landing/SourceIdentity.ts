import { TabCharacter, UserInput } from '@shared'
import { git, type LandingIO } from './LandingIO'

/** requireSourceHead rejects changes to the reviewed source identity before publication. */
export async function requireSourceHead(io: LandingIO, expectedHead: string): Promise<void> {
  UserInput.require(
    await git(io, ['rev-parse', 'HEAD']) === expectedHead,
    'HEAD changed after verification. Review and verify the new source before rerunning land.',
  )
}

/** pinArchive records only the archive gitlink above the exact verified source and returns its checked identity. */
export async function pinArchive(io: LandingIO, verifiedHead: string, publishedArchive: string): Promise<string> {
  await requireSourceHead(io, verifiedHead)
  UserInput.require(
    await git(io, ['rev-parse', 'HEAD'], { storage: true }) === publishedArchive,
    'Storage advanced after remote confirmation; rerun land before pinning its archive.',
  )
  await git(io, ['update-index', '--cacheinfo', `160000,${publishedArchive},.storage`])
  const staged = await git(io, ['diff', '--cached', '--name-only', '--ignore-submodules=none'])
  if (!staged) {
    await requireArchiveGitlink(io, verifiedHead, publishedArchive)
    return verifiedHead
  }
  UserInput.require(
    staged === '.storage',
    'The archive pointer update includes unrelated staged changes; preserve them before rerunning land.',
  )
  const indexed = await git(io, ['ls-files', '--stage', '--', '.storage'])
  UserInput.require(
    indexed === `160000 ${publishedArchive} 0${TabCharacter}.storage`,
    'The staged archive identity changed after publication; review before rerunning land.',
  )
  await requireSourceHead(io, verifiedHead)
  await git(io, ['commit', '-m', 'Pin published preview performance history', '--', '.storage'])
  const pointerHead = await git(io, ['rev-parse', 'HEAD'])
  await requireArchiveGitlink(io, pointerHead, publishedArchive)
  const parents = await git(io, ['show', '-s', '--format=%P', pointerHead])
  const paths = await git(io, [
    'diff-tree',
    '--no-commit-id',
    '--name-only',
    '--ignore-submodules=none',
    '-r',
    pointerHead,
  ])
  UserInput.require(
    !(parents !== verifiedHead || paths !== '.storage'),
    'The archive pointer commit is not an isolated follow-up to the verified source; review before rerunning land.',
  )
  return pointerHead
}

async function requireArchiveGitlink(io: LandingIO, source: string, publishedArchive: string): Promise<void> {
  const entry = await git(io, ['ls-tree', source, '--', '.storage'])
  UserInput.require(
    entry === `160000 commit ${publishedArchive}${TabCharacter}.storage`,
    'The source commit does not pin the confirmed published archive; review before rerunning land.',
  )
}

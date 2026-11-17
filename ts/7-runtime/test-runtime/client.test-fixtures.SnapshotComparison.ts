import { Errors, Try } from '@shared'
import { Platform, Repo, Terminal } from '@shared/os'
import { areValueSnapshotsEqual, takeValueSnapshot } from '../runtime-src/client/ValueSnapshots'

/** snapshotComparisonFixturePath locates the isolated field-enumeration probe. */
export const snapshotComparisonFixturePath = Repo.resolvePath(
  'ts/7-runtime/test-runtime/client.test-fixtures.SnapshotComparison.ts',
)

type SharedRecord = { label?: string; left?: SharedRecord; right?: SharedRecord }
const SharedBranchCount = 50
const EnumerationBudget = 2 * (SharedBranchCount + 1)

if (Platform.isMain(import.meta)) {
  verifyDistinctPairTraversal()
}

function verifyDistinctPairTraversal(): void {
  const left = takeValueSnapshot(makeSharedRecord())
  const right = takeValueSnapshot(makeSharedRecord())
  const keys = Object.keys
  let enumerations = 0

  // This process owns the temporary reflection probe. Stop at the first redundant pair.
  Object.keys = value => {
    enumerations += 1
    if (enumerations > EnumerationBudget) {
      Errors.ThrowShouldNeverHappen('Shared snapshot equality enumerated redundant field sets.')
    }
    return keys(value)
  }
  const equal = Try(() => areValueSnapshotsEqual(left, right), {
    finally() {
      Object.keys = keys
    },
  })
  if (!equal) {
    Errors.ThrowShouldNeverHappen('Equal shared snapshots failed comparison.')
  }
  Terminal.stdout.write('Shared snapshots compared')
}

function makeSharedRecord(): SharedRecord {
  let branch: SharedRecord = { label: 'same' }
  for (let index = 0; index < SharedBranchCount; index += 1) {
    branch = { left: branch, right: branch }
  }
  return branch
}

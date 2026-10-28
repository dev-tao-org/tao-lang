import { Tests } from '@shared/os'
import { reconcileWatchChanges } from '../os/WorkspaceWatchChanges'

type WatchStamp = string | undefined

Tests.test('watch reconciliation catches suppressed edits, avoids unchanged work and stops after disposal', async () => {
  let flush = () => {}
  let finishRead!: (value: WatchStamp) => void
  let stamp = 'first'
  const changes: string[] = []
  const reconciliation = reconcileWatchChanges(
    path => changes.push(path),
    async () => stamp === 'pending' ? await new Promise(resolve => finishRead = resolve) : stamp,
    (_delay, callback) => {
      flush = callback
      return () => flush = () => {}
    },
  )
  reconciliation.observe('/App.tao', stamp)
  flush()
  await Promise.resolve()
  Tests.expect(changes).toEqual([])
  reconciliation.observe('/App.tao', stamp)
  stamp = 'repaired'
  flush()
  await Promise.resolve()
  Tests.expect(changes).toEqual(['/App.tao'])
  reconciliation.observe('/App.tao', stamp)
  stamp = 'pending'
  flush()
  reconciliation.dispose()
  finishRead('late')
  await Promise.resolve()
  await Promise.resolve()
  Tests.expect(changes).toEqual(['/App.tao'])
})

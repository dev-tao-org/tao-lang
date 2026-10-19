import { Try } from '@shared'
import { Tests } from '@shared/os'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { findProjectMarker, findProjects, walk, withWritableFile, writeReadOnly } from '../Files'

Tests.test('walk skips dependency and VCS trees and does not follow directory symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-files-'))
  const outside = await mkdtemp(join(tmpdir(), 'tao-files-outside-'))
  await Try(async () => {
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await mkdir(join(root, '.git'), { recursive: true })
    await mkdir(join(root, '.tao'), { recursive: true })
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'hidden'), '')
    await writeFile(join(root, '.git', 'hidden'), '')
    await writeFile(join(root, '.tao', 'boundary'), '')
    await writeFile(join(root, 'src', 'visible'), '')
    await writeFile(join(outside, 'outside'), '')
    await symlink(outside, join(root, 'linked'))
    const canonical = await realpath(root)
    Tests.expect((await walk(root)).map(path => relative(canonical, path))).toEqual(['src/visible'])
    Tests.expect((await walk(root, { taoBoundary: false })).map(path => relative(canonical, path)).sort()).toEqual([
      '.tao/boundary',
      'src/visible',
    ])
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    },
  })
})

Tests.test('findProjectMarker sees empty nested boundaries and ignores excluded trees', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-marker-'))
  await Try(async () => {
    await mkdir(join(root, 'node_modules', '.tao'), { recursive: true })
    await mkdir(join(root, 'src', '.tao'), { recursive: true })
    const canonical = await realpath(root)
    Tests.expect(await findProjectMarker(root)).toBe(join(canonical, 'src', '.tao'))
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('findProjects stops at empty project markers instead of traversing their caches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-project-roots-'))
  const canonical = await realpath(root)
  await Try(async () => {
    await mkdir(join(root, 'App', '.tao', 'cache', 'nested', '.tao'), { recursive: true })
    await mkdir(join(root, 'Other', 'src', '.tao'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'Ignored', '.tao'), { recursive: true })
    Tests.expect(await findProjects(root)).toEqual([
      join(canonical, 'App'),
      join(canonical, 'Other', 'src'),
    ])
    Tests.expect(await findProjects(join(root, 'App'))).toEqual([join(canonical, 'App')])
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('withWritableFile restores permissions after successful and failed writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-write-'))
  const path = join(root, 'readonly')
  await Try(async () => {
    await writeFile(path, 'before', { mode: 0o400 })
    const mode = (await stat(path)).mode & 0o777
    await withWritableFile(path, async file => file.write('after'))
    await withWritableFile(path, async file => {
      await file.write('first version')
      await file.write('final')
    })
    Tests.expect(await readFile(path, 'utf8')).toBe('final')
    Tests.expect((await stat(path)).mode & 0o777).toBe(mode)
    await Tests.expect(() =>
      withWritableFile(path, async file => {
        await file.write('failed')
        throw new Error('failure')
      })
    ).toThrow()
    Tests.expect((await stat(path)).mode & 0o777).toBe(mode)
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('withWritableFile serializes concurrent callbacks for one canonical path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-write-queue-'))
  const path = join(root, 'shared')
  let finishFirst!: () => void
  let active = 0
  let maximum = 0
  await Try(async () => {
    await writeFile(path, '')
    const alias = join(root, 'alias')
    await symlink(path, alias)
    const first = withWritableFile(path, async file => {
      maximum = Math.max(maximum, ++active)
      await file.write('first')
      await new Promise<void>(resolve => finishFirst = resolve)
      active--
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    const second = withWritableFile(alias, async file => {
      maximum = Math.max(maximum, ++active)
      await file.write('second')
      active--
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    Tests.expect(maximum).toBe(1)
    finishFirst()
    await Promise.all([first, second])
    Tests.expect(await readFile(path, 'utf8')).toBe('second')
    Tests.expect(maximum).toBe(1)
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('generated metadata is read-only and refuses dangling symlink destinations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tao-generated-'))
  await Try(async () => {
    const path = join(root, 'metadata')
    await writeReadOnly(path, 'initial')
    await writeReadOnly(path, 'updated')
    Tests.expect(await readFile(path, 'utf8')).toBe('updated')
    Tests.expect((await stat(path)).mode & 0o222).toBe(0)
    const missing = join(root, 'missing')
    const link = join(root, 'link')
    await symlink(missing, link)
    await Tests.expect(() => writeReadOnly(link, 'unsafe')).toThrow('regular file')
    await Tests.expect(() => stat(missing)).toThrow()
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

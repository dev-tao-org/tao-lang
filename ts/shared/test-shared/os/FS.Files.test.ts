import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Platform } from '@shared/os'
import * as Files from '../../shared-src/os/FS/Files'

const { join, relative } = Path
const { mkdir, mkdirs, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } = FS
const { temporaryDirectory } = Platform

Tests.test('walk skips dependency and VCS trees and does not follow directory symlinks', async () => {
  const root = await mkdtemp(join(temporaryDirectory(), 'tao-files-'))
  const outside = await mkdtemp(join(temporaryDirectory(), 'tao-files-outside-'))
  await Try(async () => {
    await mkdirs(join(root, 'node_modules'), join(root, '.git'), join(root, '.tao'), join(root, 'src'))
    await writeFile(join(root, 'node_modules', 'hidden'), '')
    await writeFile(join(root, '.git', 'hidden'), '')
    await writeFile(join(root, '.tao', 'boundary'), '')
    await writeFile(join(root, 'src', 'visible'), '')
    await writeFile(join(outside, 'outside'), '')
    await symlink(outside, join(root, 'linked'))
    const canonical = await realpath(root)
    Tests.expect((await Files.walk(root)).map(path => relative(canonical, path))).toEqual(['src/visible'])
    Tests.expect((await Files.walk(root, { taoBoundary: false })).map(path => relative(canonical, path)).sort())
      .toEqual([
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
  const root = await mkdtemp(join(temporaryDirectory(), 'tao-marker-'))
  await Try(async () => {
    await mkdirs(join(root, 'node_modules', '.tao'), join(root, 'src', '.tao'))
    const canonical = await realpath(root)
    Tests.expect(await Files.findProjectMarker(root)).toBe(join(canonical, 'src', '.tao'))
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('findProjects stops at empty project markers instead of traversing their caches', async () => {
  const root = await mkdtemp(join(temporaryDirectory(), 'tao-project-roots-'))
  const canonical = await realpath(root)
  await Try(async () => {
    await mkdirs(join(root, 'App', '.tao', 'cache', 'nested', '.tao'), join(root, 'Other', 'src', '.tao'))
    await mkdir(join(root, 'node_modules', 'Ignored', '.tao'))
    Tests.expect(await Files.findProjects(root)).toEqual([
      join(canonical, 'App'),
      join(canonical, 'Other', 'src'),
    ])
    Tests.expect(await Files.findProjects(join(root, 'App'))).toEqual([join(canonical, 'App')])
  }, {
    async finally() {
      await rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('withWritableFile restores permissions after successful and failed writes', async () => {
  const root = await mkdtemp(join(temporaryDirectory(), 'tao-write-'))
  const path = join(root, 'readonly')
  await Try(async () => {
    await writeFile(path, 'before', { mode: 0o400 })
    const mode = (await stat(path)).mode & 0o777
    await Files.withWritableFile(path, async file => file.write('after'))
    await Files.withWritableFile(path, async file => {
      await file.write('first version')
      await file.write('final')
    })
    Tests.expect(await readFile(path, 'utf8')).toBe('final')
    Tests.expect((await stat(path)).mode & 0o777).toBe(mode)
    await Tests.expect(() =>
      Files.withWritableFile(path, async file => {
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

Tests.test('generated metadata is read-only and refuses dangling symlink destinations', async () => {
  const root = await mkdtemp(join(temporaryDirectory(), 'tao-generated-'))
  await Try(async () => {
    const path = join(root, 'metadata')
    await Files.writeReadOnly(path, 'initial')
    await Files.writeReadOnly(path, 'updated')
    Tests.expect(await readFile(path, 'utf8')).toBe('updated')
    Tests.expect((await stat(path)).mode & 0o222).toBe(0)
    const missing = join(root, 'missing')
    const link = join(root, 'link')
    await symlink(missing, link)
    await Tests.expect(() => Files.writeReadOnly(link, 'unsafe')).toThrow('regular file')
    await Tests.expect(() => stat(missing)).toThrow()
  }, { finally: () => rm(root, { recursive: true, force: true }) })
})

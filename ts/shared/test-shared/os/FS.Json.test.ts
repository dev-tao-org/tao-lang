import { Json, Schema, Try } from '@shared'
import * as Tests from '@shared-tests'
import * as FS from '../../shared-src/os/FS/FS'
import * as Hash from '../../shared-src/os/Hash'
import * as Path from '../../shared-src/os/Path'
import * as Platform from '../../shared-src/os/Platform'

Tests.test('JSON filesystem helpers preserve schemas, file flags, and deterministic hashes', async () => {
  const root = await FS.mkdtemp(Path.join(Platform.temporaryDirectory(), 'tao-json-'))
  const path = Path.join(root, 'settings.json')
  const schema = Schema.object({ name: Schema.string(), count: Schema.string().transform(Number) })
  await Try(async () => {
    await FS.writeJson(path, { name: 'Tao', count: '3' }, { prettyPrint: false, flag: 'wx' })
    const settings = await FS.readJson(path, { schema, sourceName: 'settings.json', encoding: 'utf8', flag: 'r' })
    Tests.expect(settings).toEqual({ name: 'Tao', count: 3 })
    Tests.expect(await FS.readFile(path, 'utf8')).toBe('{"name":"Tao","count":"3"}')
    Tests.expect(Hash.Of({ z: { y: 2, x: 1 } })).toBe(Hash.Of({ z: { x: 1, y: 2 } }))
    Tests.expect(Hash.Of([1, 2])).not.toBe(Hash.Of([2, 1]))
    const invalidWrite = await FS.writeJson(path, undefined).catch(error => error)
    Tests.expect(invalidWrite).toBeInstanceOf(Error)
    Tests.expect(Json.Parse(await FS.readFile(path, 'utf8'), { schema })).toEqual(settings)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

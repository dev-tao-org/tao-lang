import { Json, NewlineCharacter, Schema, Try } from '@shared'
import * as Tests from '@shared-tests'
import z from '../../shared-src/bridges/Bridge_zod'
import * as JsonSorted from '../../shared-src/universal/Json/Sorted'
import * as Objects from '../../shared-src/universal/Objects'

Tests.test('JSON codecs support native options, schema validation, and deterministic encodings', () => {
  const value = { 'z': [3, { z: -0, a: 'quoted"' }], 'a': true, '2': null, '10': false }
  Tests.expect(Json.Print(value)).toBe([
    '{',
    '  "2": null,',
    '  "10": false,',
    '  "z": [',
    '    3,',
    '    {',
    '      "z": 0,',
    '      "a": "quoted\\""',
    '    }',
    '  ],',
    '  "a": true',
    '}',
  ].join(NewlineCharacter))
  Tests.expect(Json.Print({ z: 1, a: 2 }, { prettyPrint: false })).toBe('{"z":1,"a":2}')
  Tests.expect(Json.Print({ value: 1 }, { replacer: ['value'] })).toBe(
    ['{', '  "value": 1', '}'].join(NewlineCharacter),
  )
  Tests.expect(Json.Parse('{"__proto__":1,"value":null}')).toEqual({ ['__proto__']: 1, value: null })
  const schema = Schema.object({ name: Schema.string(), count: Schema.string().transform(Number) })
  Tests.expect(Json.Parse('{"name":"Tao","count":"4"}', { schema, sourceName: 'fixture.json' }))
    .toEqual({ name: 'Tao', count: 4 })
  Tests.expect(Schema.Parse({ name: 'Tao', count: '4' }, schema)).toEqual({ name: 'Tao', count: 4 })
  Tests.expect(JsonSorted.Sorted([{ z: 1, a: [{ y: 2, x: 1 }] }])).toBe('[{"a":[{"x":1,"y":2}],"z":1}]')
  Tests.expect(Objects.equal({ z: { y: 2, x: 1 }, a: 0 }, { a: 0, z: { x: 1, y: 2 } })).toBe(true)
  Tests.expect(Objects.equal([1, 2], [2, 1])).toBe(false)
  Tests.expect(Objects.equal({ omitted: undefined }, {})).toBe(true)
  Tests.expect(Json.Canonical(value)).toBe('{"10":false,"2":null,"a":true,"z":[3,{"a":"quoted\\"","z":0}]}')
  Tests.expect(Json.Canonical({ '\ue000': 1, '\ud800\udc00': 2, 'A': 3, 'a': 4 }))
    .toBe('{"A":3,"a":4,"𐀀":2,"":1}')
  const shared = { a: 1 }
  Tests.expect(Json.Canonical([shared, shared, Object.assign(Object.create(null), { z: 2, a: 1 })]))
    .toBe('[{"a":1},{"a":1},{"a":1,"z":2}]')
  assertInvalidCanonicalData()
  assertFailures()
})

function assertInvalidCanonicalData(): void {
  const cycle: unknown[] = []
  cycle.push(cycle)
  let accessed = false
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      accessed = true
    },
  })
  const invalid = [
    undefined,
    () => 1,
    Symbol('x'),
    1n,
    NaN,
    Infinity,
    -Infinity,
    { a: undefined },
    [undefined],
    new Array(1),
    Object.assign([], { extra: 1 }),
    new Date(0),
    new Map(),
    new Number(1),
    { toJSON: () => 1 },
    { [Symbol('x')]: 1 },
    Object.defineProperty({}, 'hidden', { value: 1 }),
    accessor,
    cycle,
    Object.create({ inherited: 1 }),
  ]
  for (const candidate of invalid) {
    const failure = Try(() => Json.Canonical(candidate), { catch: error => error })
    Tests.expect(failure).toBeInstanceOf(Error)
  }
  Tests.expect(accessed).toBe(false)
}

function assertFailures(): void {
  const syntax = Try(() => Json.Parse('{', { sourceName: 'broken.json' }), { catch: error => error })
  Tests.expect(syntax).toBeInstanceOf(Error)
  Tests.expect((syntax as Error & { cause?: unknown }).cause).toBeInstanceOf(Error)
  Tests.expect((syntax as Error).message).toContain('broken.json')
  const invalid = Try(
    () => Json.Parse('{"name":1}', { schema: Schema.object({ name: Schema.string() }), sourceName: 'user.json' }),
    {
      catch: error => error,
    },
  )
  Tests.expect(invalid).toBeInstanceOf(Error)
  Tests.expect((invalid as Error & { cause?: unknown }).cause).toBeInstanceOf(z.ZodError)
  Tests.expect((invalid as Error).message).toContain('user.json')
  const cycle: unknown[] = []
  cycle.push(cycle)
  Tests.expect(Try(() => Json.Print(cycle, { replacer: [] }), { catch: error => error })).toBeInstanceOf(Error)
  Tests.expect(Try(() => Json.Print(1n), { catch: error => error })).toBeInstanceOf(Error)
}

import { Json, NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'

Tests.test('JSON codecs retain native bytes while canonical data has deterministic lossless boundaries', () => {
  const value = { 'z': [3, { z: -0, a: 'quoted"' }], 'a': true, '2': null, '10': false }
  Tests.expect(Json.Print(value)).toBe('{"2":null,"10":false,"z":[3,{"z":0,"a":"quoted\\""}],"a":true}')
  Tests.expect(Json.PrintIndented({ z: 1, a: 2 })).toBe(['{', '  "z": 1,', '  "a": 2', '}'].join(NewlineCharacter))
  Tests.expect(Json.Parse('{"__proto__":1,"value":null}')).toEqual({ ['__proto__']: 1, value: null })
  Tests.expect(Json.Canonical(value)).toBe('{"10":false,"2":null,"a":true,"z":[3,{"a":"quoted\\"","z":0}]}')
  Tests.expect(Json.Canonical({ '\ue000': 1, '\ud800\udc00': 2, 'A': 3, 'a': 4 }))
    .toBe('{"A":3,"a":4,"𐀀":2,"":1}')
  const shared = { a: 1 }
  Tests.expect(Json.Canonical([shared, shared, Object.assign(Object.create(null), { z: 2, a: 1 })]))
    .toBe('[{"a":1},{"a":1},{"a":1,"z":2}]')
  assertInvalidCanonicalData()
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

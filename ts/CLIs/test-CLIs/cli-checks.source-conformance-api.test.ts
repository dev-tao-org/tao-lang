import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { checkSourceConformance } from '../CLIs-src/cli-checks/source-conformance'

Tests.test('source conformance > checks workspace declarations and ignores dependency and legacy sources', async () => {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-source-conformance-'))
  await Try(async () => {
    await FS.write(
      Path.join(root, 'ts/public.d.ts'),
      Shared.joinTextLines(
        S`
          /** publicValue stores a number. */
          export declare const publicValue: number
        `,
        '',
      ),
    )
    await FS.write(Path.join(root, 'ts/node_modules/ignored/index.ts'), 'export const missingDocs = 1')
    await FS.write(Path.join(root, '.x-tao-old-v1/ignored.ts'), 'export const missingDocs = 1')
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
    await FS.write(Path.join(root, 'ts/public.d.ts'), 'export declare const publicValue: number\n')
    await Tests.expect(checkSourceConformance(root)).rejects.toThrow(
      'ts/public.d.ts:1: exported API publicValue needs JSDoc',
    )
  }, {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('source conformance > enforces naming rules on handwritten sources and excludes generated sources', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-naming-rules-'))
  await Try(async () => {
    const source = S`
      const value: First | Second = first
      const accepted = first && second && third && fourth
      text.replace(/pattern/g, '')
    `
    await FS.write(Path.join(root, 'ts/generated/ignored.ts'), source)
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
    await FS.write(Path.join(root, 'ts/consumer.ts'), source)
    const diagnostic = await Try(async () => {
      await checkSourceConformance(root)
      return ''
    }, { catch: error => String(error) })
    Tests.expect(diagnostic).toContain('union types need a purpose-named domain alias')
    Tests.expect(diagnostic).toContain('boolean expressions need at most two')
    Tests.expect(diagnostic).toContain('regular expression literals and constructors must initialize a named const')
  }, {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('source conformance > resolves imported member types before recommending optional access', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-optional-access-'))
  await Try(async () => {
    await FS.write(
      Path.join(root, 'ts/tsconfig.base.json'),
      Json.Print({
        compilerOptions: { strict: true, paths: { '@model': ['./model.ts'] } },
      }),
    )
    await FS.write(
      Path.join(root, 'ts/model.ts'),
      Shared.joinTextLines(
        S`
          /** Token represents a parsed label. */
          export interface Token { text: string }
        `,
        '',
      ),
    )
    const source = S`
      import type { Token } from '@model'
      type OptionalToken = Token | null
      type OptionalLabel = 'label' | undefined
      declare const token: OptionalToken
      token ? token.text as 'label' : undefined
    `
    await FS.write(Path.join(root, 'ts/consumer.ts'), source)
    await Tests.expect(checkSourceConformance(root)).rejects.toThrow('ts/consumer.ts:5: prefer optional access')
    await FS.write(
      Path.join(root, 'ts/consumer.ts'),
      source.replace(
        "token ? token.text as 'label' : undefined",
        'token?.text as OptionalLabel',
      ),
    )
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
  }, {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('source conformance > requires one-line imports and accepts namespace-qualified types', async () => {
  await withTemporaryWorkspace('single-line-import', async root => {
    await writeImportFixture(root)
    await verifySingleLineImports(root)
  })
})

async function withTemporaryWorkspace(name: string, run: (root: string) => Promise<void>): Promise<void> {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', `tao-${name}-`))
  await Try(() => run(root), { finally: () => FS.rm(root, { recursive: true, force: true }) })
}

async function writeImportFixture(root: string): Promise<void> {
  await FS.write(
    Path.join(root, 'ts/tsconfig.base.json'),
    Json.Print({ compilerOptions: { strict: true, paths: { '@model': ['./model.ts'] } } }),
  )
  await FS.write(Path.join(root, 'ts/model.ts'), ImportedTokenSource)
  await FS.write(Path.join(root, 'ts/generated/imports.ts'), GeneratedImportSource)
  await FS.write(Path.join(root, 'ts/vendor/imports.ts'), VendorImportSource)
  await FS.write(Path.join(root, 'ts/consumer.ts'), MultilineImportSource)
}

async function verifySingleLineImports(root: string): Promise<void> {
  await Tests.expect(checkSourceConformance(root)).rejects.toThrow(
    'ts/consumer.ts:1: import declarations must fit on one line; use a namespace import for long lists',
  )
  await FS.write(Path.join(root, 'ts/consumer.ts'), NamespaceImportSource)
  await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
}

const ImportedTokenSource = Shared.joinTextLines(
  S`
    /** Token represents a parsed label. */
    export interface Token { text: string }
  `,
  '',
)
const MultilineImportSource = Shared.joinTextLines(
  S`
    import {
      type Token,
    } from '@model'
    type TokenAlias = Token
  `,
  '',
)
const GeneratedImportSource = MultilineImportSource.replace('TokenAlias', 'GeneratedToken')
const VendorImportSource = Shared.joinTextLines(
  S`
    // @third-party external library source
    import {
      type Token,
    } from '@model'
    type VendorToken = Token
  `,
  '',
)
const NamespaceImportSource = Shared.joinTextLines(
  S`
    import * as Model from '@model'
    type TokenAlias = Model.Token
  `,
  '',
)

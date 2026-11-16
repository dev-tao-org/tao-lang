import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'
import * as Typecheck from '@typecheck'

import { S } from '@shared'

import { collectLibraryPublications } from '../compile-src/Compile/LibraryPublications'

Tests.test('library publication lists require commas, reject aliases and accept trailing commas', () => {
  const parser = Grammar.createParser()
  Tests.expect(parser.parse('ts-library Demo { publish { First, Second as Other, } }').rootNode.hasError).toBe(true)
  Tests.expect(parser.parse('ts-library Demo { publish { First, Second, } }').rootNode.hasError).toBe(false)
  Tests.expect(parser.parse('publish { First, Second, }').rootNode.hasError).toBe(false)
  Tests.expect(parser.parse('publish { First Second }').rootNode.hasError).toBe(true)
  Tests.expect(parser.parse('ts-library Demo { publish { First Second } }').rootNode.hasError).toBe(true)
})

Tests.test('library publications reject private, unsupported, duplicate and dependency definitions', () => {
  const source = S`
    ts-library Demo { publish { Greeting, } }
    public view Greeting(Value text) {
      render inject Value \`\`\`ts return <Tao.Text>{Value}</Tao.Text> \`\`\`
    }
  `
  Tests.expect(resolvePublications(source).map(view => view.path)).toEqual(['Greeting'])
  Tests.expect(() => resolvePublications(source.replace('public view', 'file view'))).toThrow('public declaration')
  Tests.expect(() => resolvePublications(source.replace('Value text', 'Value number'))).toThrow('text parameters')
  Tests.expect(() => resolvePublications(source.replace('Greeting, }', 'Greeting, Greeting, }'))).toThrow('Duplicate')
  Tests.expect(() => resolvePublications(source, new Set())).toThrow('dependency definition')
})

Tests.test('module publication resolves one list across imported sources including a list-only file', () => {
  const createModule = (path: string, source: string): Typecheck.SourceModule => ({
    path,
    document: AST.transform(Grammar.createParser().parse(source))!,
    imports: [],
    siblings: [],
  })
  const entry = createModule(
    'Library.tao',
    S`
      use package ./cards as Cards
      ts-library Demo { publish { Cards, } }
    `,
  )
  const greeting = createModule(
    'cards/Greeting.tao',
    'public view Greeting(Name text) { render inject ```ts return null ``` }',
  )
  const other = createModule('cards/Other.tao', 'public view Other { render inject ```ts return null ``` }')
  const list = createModule('cards/Publication.tao', 'publish { Greeting, }')
  entry.imports = [{
    statement: AST.GetImportStatements(entry.document)[0]!,
    targets: [greeting, other, list].map(module => ({ path: module.path, relation: 'same-project' })),
  }]
  const sources = [entry, greeting, other, list]
  const program = Typecheck.linkModules(entry.path, sources)
  Tests.expect(collectLibraryPublications(program, new Set(sources.map(module => module.path))).map(view => view.path))
    .toEqual(['Cards/Greeting'])
})

Tests.test('library signatures allow uppercase Tao props with React-related names', () => {
  const source = S`
    ts-library Demo { publish { Greeting, } }
    public view Greeting(Value text) { render inject \`\`\`ts return null \`\`\` }
  `
  const publications = resolvePublications(source.replace('Value text', 'Children text, Key text, Ref text'))
  Tests.expect(publications[0]!.declaration.parameters.map(parameter => parameter.name.value))
    .toEqual(['Children', 'Key', 'Ref'])
})

function resolvePublications(source: string, ownSources: ReadonlySet<string> = new Set(['Library.tao'])) {
  const document = AST.transform(Grammar.createParser().parse(source))!
  const module = { path: 'Library.tao', document, imports: [], siblings: [] }
  return collectLibraryPublications(Typecheck.linkModules(module.path, [module]), ownSources)
}

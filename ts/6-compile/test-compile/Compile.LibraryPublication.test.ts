import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'
import * as Typecheck from '@typecheck'

import { S } from '@shared'

import { collectLibraryPublications, requireLibraryPublication } from '../compile-src/Compile/LibraryPublications'

Tests.test('library publication lists require commas, reject aliases and accept trailing commas', () => {
  const parser = Grammar.createParser()
  Tests.expect(parser.parse('ts-library Demo { publish { First, Second as Other, } }').rootNode.hasError).toBe(true)
  Tests.expect(parser.parse('ts-library Demo { publish { First, @second, } }').rootNode.hasError).toBe(false)
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
  Tests.expect(resolvePublications(source).map(view => view.name)).toEqual(['Greeting'])
  Tests.expect(() => resolvePublications(source.replace('public view', 'file view'))).toThrow('public declaration')
  Tests.expect(() => resolvePublications(source.replace('Value text', 'Value number'))).toThrow('text parameters')
  Tests.expect(() => resolvePublications(source.replace('Greeting, }', 'Greeting, Greeting, }'))).toThrow('Duplicate')
  Tests.expect(() => resolvePublications(source, new Set())).toThrow('dependency definition')
})

Tests.test('publication keeps public package paths and excludes nested packages and private declarations', () => {
  const createModule = (path: string, source: string): Typecheck.SourceModule => ({
    path,
    document: AST.transform(Grammar.createParser().parse(source))!,
    imports: [],
    siblings: [],
  })
  const entry = createModule(
    '/project/Library.tao',
    'ts-library Demo { publish { @cards, } }',
  )
  const greeting = createModule(
    '/project/@cards/details/Greeting.tao',
    'public view Greeting(Name text) { render inject ```ts return null ``` }',
  )
  const other = createModule('/project/@cards/Other.tao', 'view Other { render inject ```ts return null ``` }')
  const nested = createModule(
    '/project/@cards/@nested/Hidden.tao',
    'public view Hidden { render inject ```ts return null ``` }',
  )
  const sources = [entry, greeting, other, nested]
  const program = Typecheck.linkModules(entry.path, sources)
  const publication = {
    declaration: requireLibraryPublication(entry.document),
    ownSources: new Set(sources.map(module => module.path)),
    packageRoots: new Map([['@cards', '/project/@cards']]),
  }
  Tests.expect(collectLibraryPublications(program, publication).map(view => [view.subpath, view.name]))
    .toEqual([['./@cards/details', 'Greeting']])
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
  const declaration = requireLibraryPublication(document)
  return collectLibraryPublications(Typecheck.linkModules(module.path, [module]), {
    declaration,
    ownSources,
    packageRoots: new Map(),
  })
}

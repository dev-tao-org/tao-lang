import * as AST from '@ast-gen'
import * as Compile from '@compile'
import * as Grammar from '@grammar'
import * as Runtime from '@runtime'
import * as Tests from '@shared-tests'
import * as Typecheck from '@typecheck'

import { NewlineCharacter, S, Timings, Try } from '@shared'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'

import { TypeScript } from '@tao/shared/typescript'
import { publishBuild } from '../workspace-src/Workspace/WorkspaceBuild'

Tests.test('standard view uses navigate through generated lexical types to their source-owned definition', async () => {
  await inspectGeneratedTypes(await generateNavigationFixture(), (service, build) => {
    const source = Path.join(build, 'ts/packages/Main.views.tsx')
    const text = FS.readFileSync(source, 'utf8')
    const anchor = '_Imported_UI$Text["Text"]'
    const use = text.indexOf(anchor) + '_Imported_UI$Text["'.length
    Tests.expect(text).toContain(anchor)
    const definitions = service.getDefinitionAtPosition(source, use) ?? []
    Tests.expect(definitions.map(definition => definition.fileName)).toContain(
      Path.join(build, 'ts/dependencies/tao/@ui/Views.ts'),
    )
  })
})

Tests.test('private views shadow inherited text without string capture annotations', async () => {
  const source = S`
    let Card = "outer"
    app Main { root Owner }
    view Owner {
      render Card
      view Card {
        render inject Captured Card \`\`\`ts return String(Captured) \`\`\`
      }
    }
  `
  const entry = AST.transform(Grammar.createParser().parse(source))!
  await inspectGeneratedTypes(Compile.compile(entry, { revision: 'shadowed-view' }))
})

Tests.test('generated scope types permit cyclic modules and self-imported aliases', async () => {
  const parser = Grammar.createParser()
  const entry = AST.transform(parser.parse(S`
    use ./Other Value
    use ./Main Shared as Own
    public let Shared = "ready"
    app Main { root Root }
    view Root { render inject Value \`\`\`ts return Value \`\`\` }
  `))!
  const other = AST.transform(parser.parse(S`
    use ./Main Shared
    public let Value = Shared
  `))!
  const statements = AST.GetImportStatements(entry)
  const otherStatement = AST.GetImportStatements(other)[0]!
  const program = Typecheck.linkModules('/app/Main.tao', [{
    path: '/app/Main.tao',
    document: entry,
    imports: [
      { statement: statements[0]!, targets: [{ path: '/app/Other.tao', relation: 'same-directory' }] },
      { statement: statements[1]!, targets: [{ path: '/app/Main.tao', relation: 'same-directory' }] },
    ],
    siblings: [],
  }, {
    path: '/app/Other.tao',
    document: other,
    imports: [{ statement: otherStatement, targets: [{ path: '/app/Main.tao', relation: 'same-directory' }] }],
    siblings: [],
  }])
  await inspectGeneratedTypes(Compile.compile(entry, { program, revision: 'cyclic-scopes' }))
})

async function inspectGeneratedTypes(
  files: Readonly<Record<string, string>>,
  inspect: (service: TypeScript.LanguageService, build: string) => void = () => {},
): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `generated-navigation-${Platform.randomUUID()}`)
  await Try(async () => {
    const runtime = await Runtime.create({
      directory: Path.join(root, 'runtime'),
      dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules'),
    })
    const build = Path.join(root, 'build')
    const publish = Timings.createTopLevelTimer(async timings =>
      await publishBuild(build, files, 'navigation', async () => runtime, () => true, timings)
    )
    await publish()
    const configPath = Path.join(build, 'tsconfig.json')
    const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile)
    const parsed = TypeScript.parseJsonConfigFileContent(config.config, TypeScript.sys, build)
    const service = TypeScript.createLanguageService(createLanguageServiceHost(parsed))
    await Try(() => {
      const diagnostics = parsed.fileNames.flatMap(path => service.getSemanticDiagnostics(path))
      Tests.expect(
        diagnostics.map(diagnostic =>
          TypeScript.flattenDiagnosticMessageText(diagnostic.messageText, NewlineCharacter)
        ),
      )
        .toEqual([])
      inspect(service, build)
    }, { finally: () => service.dispose() })
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
}

async function generateNavigationFixture(): Promise<Readonly<Record<string, string>>> {
  const parser = Grammar.createParser()
  const entry = AST.transform(parser.parse(S`
    use package tao@ui as UI
    app Main { root Root }
    view Root { render UI.Col { UI.Text("Hello") } }
  `))!
  const standardPath = Repo.resolvePath('ts/stdlib/stdlib-src/@ui/Views.tao')
  const standard = AST.transform(parser.parse(await FS.readFile(standardPath, 'utf8')))!
  const statement = AST.GetImportStatements(entry)[0]!
  const program = Typecheck.linkModules('/app/Main.tao', [
    {
      path: '/app/Main.tao',
      document: entry,
      imports: [{ statement, targets: [{ path: standardPath, relation: 'public' }] }],
      siblings: [],
    },
    {
      path: standardPath,
      document: standard,
      imports: [],
      siblings: [],
      project: { root: Path.dirname(Path.dirname(standardPath)), alias: 'tao' },
    },
  ])
  return Compile.compile(entry, { program, revision: 'navigation' })
}

function createLanguageServiceHost(parsed: TypeScript.ParsedCommandLine): TypeScript.LanguageServiceHost {
  return {
    ...TypeScript.sys,
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '0',
    useCaseSensitiveFileNames: () => TypeScript.sys.useCaseSensitiveFileNames,
    getScriptSnapshot(path) {
      const text = TypeScript.sys.readFile(path)
      return text === undefined ? undefined : TypeScript.ScriptSnapshot.fromString(text)
    },
    getDefaultLibFileName: TypeScript.getDefaultLibFilePath,
  }
}

import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { compile } from '@compile/Compile'
import { createParser } from '@grammar/parser'
import * as Runtime from '@runtime/Runtime'
import { NewlineCharacter, S, Timings, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { linkModules } from '@typecheck/LinkModules'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { publishBuild } from '../workspace-src/WorkspaceBuild'

Tests.test('standard view uses navigate through generated lexical types to their source-owned definition', async () => {
  await inspectGeneratedTypes(await generateNavigationFixture(), (service, build) => {
    const source = Path.join(build, 'source/Main.views.tsx')
    const text = FileSystem.readFileSync(source, 'utf8')
    const anchor = '_Imported_UI$Text["Text"]'
    const use = text.indexOf(anchor) + '_Imported_UI$Text["'.length
    Tests.expect(text).toContain(anchor)
    const definitions = service.getDefinitionAtPosition(source, use) ?? []
    Tests.expect(definitions.map(definition => definition.fileName)).toContain(Path.join(build, 'tao/ui/Views.ts'))
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
  const entry = transform(createParser().parse(source))!
  await inspectGeneratedTypes(compile(entry, { revision: 'shadowed-view' }))
})

Tests.test('generated scope types permit cyclic modules and self-imported aliases', async () => {
  const parser = createParser()
  const entry = transform(parser.parse(S`
    use Value from ./Other
    use Shared as Own from ./Main
    public let Shared = "ready"
    app Main { root Root }
    view Root { render inject Value \`\`\`ts return Value \`\`\` }
  `))!
  const other = transform(parser.parse(S`
    use Shared from ./Main
    public let Value = Shared
  `))!
  const statements = AST.GetImportStatements(entry)
  const otherStatement = AST.GetImportStatements(other)[0]!
  const program = linkModules('/app/Main.tao', [{
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
  await inspectGeneratedTypes(compile(entry, { program, revision: 'cyclic-scopes' }))
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
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
}

async function generateNavigationFixture(): Promise<Readonly<Record<string, string>>> {
  const parser = createParser()
  const entry = transform(parser.parse(S`
    use package tao@ui as UI
    app Main { root Root }
    view Root { render UI.Col { UI.Text("Hello") } }
  `))!
  const standardPath = Repo.resolvePath('ts/stdlib/stdlib-src/@ui/Views.tao')
  const standard = transform(parser.parse(await FileSystem.readFile(standardPath, 'utf8')))!
  const statement = AST.GetImportStatements(entry)[0]!
  const program = linkModules('/app/Main.tao', [
    {
      path: '/app/Main.tao',
      document: entry,
      imports: [{ statement, targets: [{ path: standardPath, relation: 'public' }] }],
      siblings: [],
    },
    { path: standardPath, document: standard, imports: [], siblings: [] },
  ])
  return compile(entry, { program, revision: 'navigation' })
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

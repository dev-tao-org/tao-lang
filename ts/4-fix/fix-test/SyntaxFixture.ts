import type { NodeType } from '@grammar/CST'
import { S } from '@shared'

/** syntaxFixture exercises every named rule in the current Tao grammar. */
export const syntaxFixture = S`
  // Current syntax
  use package tao@ui as UI
  use all from ./Shared
  use Card as Panel,Heading from @cards
  use Local
  requires github:acme/widgets version v1.2.0 as widgets
  requires npm:@date-fns/tz version 4.1.0
  file let Caption is text="Hello"
  folder app Demo{root Root}
  public view Root( Title text,Subtitle text ){
  let Hidden="Private"
  render #root UI . Col{#child Panel( Title,Caption ) let Message=Hidden UI.Text(Message)}
  }
  package view Native(Value text){render inject Value,Kids @@children \`\`\`ts return <TR.ReactNative.Text>{Value}</TR.ReactNative.Text> \`\`\`}
  project let Shared=Caption
  public view FormattedDate(Value text) from ./FormattedDate.tsx
  tests "Source"{test(Label "Case"){run Demo press #child type "Set" into #child expect text "Ready" expect #child input value "Set" expect #child{text "Ready" input value "Set"} expect{text "Ready"}} test "Short"{} test(){} }
`

/** formattedSyntaxFixture pins canonical spacing and layout without changing source tokens. */
export const formattedSyntaxFixture = S`
  // Current syntax
  use package tao@ui as UI
  use all from ./Shared
  use Card as Panel, Heading from @cards
  use Local
  requires github:acme/widgets version v1.2.0 as widgets
  requires npm:@date-fns/tz version 4.1.0

  file
  let Caption is text = "Hello"

  folder
  app Demo {
    root Root
  }

  public
  view Root(Title text, Subtitle text) {
    let Hidden = "Private"
    render #root UI.Col {
      #child
      Panel(Title, Caption)
      let Message = Hidden
      UI.Text(Message)
    }
  }

  package
  view Native(Value text) {
    render inject Value, Kids @@children \`\`\`ts return <TR.ReactNative.Text>{Value}</TR.ReactNative.Text> \`\`\`
  }

  project
  let Shared = Caption

  public
  view FormattedDate(Value text) from ./FormattedDate.tsx

  tests "Source" {
    test(Label "Case") {
      run Demo
      press #child
      type "Set" into #child
      expect text "Ready"
      expect #child input value "Set"
      expect #child {
        text "Ready"
        input value "Set"
      }
      expect {
        text "Ready"
      }
    }
    test "Short" { }
    test() { }
  }
`

/** syntaxKinds makes grammar additions require an explicit fixture coverage decision. */
export const syntaxKinds = {
  SourceFile: true,
  AppDeclaration: true,
  RootDeclaration: true,
  ViewDeclaration: true,
  RenderStatement: true,
  ParameterList: true,
  Parameter: true,
  Injection: true,
  InjectionCapture: true,
  ContextReference: true,
  TypeScript: true,
  ViewRender: true,
  LetDefinition: true,
  UseStatement: true,
  NamedImport: true,
  All: true,
  UsePackageStatement: true,
  RequiresDeclaration: true,
  RequirementProvider: true,
  RequirementIdentifier: true,
  RequirementVersion: true,
  ForeignView: true,
  ImportPath: true,
  Visibility: true,
  TestsDeclaration: true,
  TestDeclaration: true,
  RunStatement: true,
  PressStatement: true,
  TypeStatement: true,
  ExpectStatement: true,
  TextExpectation: true,
  InputExpectation: true,
  InputValueExpectation: true,
  RenderTag: true,
  ArgumentList: true,
  TextLiteral: true,
  Comment: true,
  Identifier: true,
  QualifiedName: true,
} satisfies Record<NodeType, true>

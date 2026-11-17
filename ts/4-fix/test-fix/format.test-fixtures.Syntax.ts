import type * as CST from '@cst'
import { S } from '@shared'

/** syntaxFixture exercises every named rule in the current Tao grammar. */
export const syntaxFixture = S`
  // Current syntax
  use tao@ui Col,Text
  use ./Shared Example
  use @cards Card as Panel,Heading
  use Local
  requires github:acme/widgets version v1.2.0 as Widgets
  requires npm:@date-fns/tz version 4.1.0
  ts-library Demo{publish{Root,@cards,}}
  file let Caption is text="Hello"
  folder app Demo{root Root}
  package view Root( Title text,Subtitle text ){
  let Hidden="Private"
  state Status is text=Title
  action Rename (Value text){set Status=Value}
  action Save(){do Rename (Caption)}
  render #root UI . Col{#child Panel( Title,Caption ) let Message=Hidden UI.Text(Message) UI.Button(Status){on press Save} UI.Button(Subtitle){on press->do Rename(Title)}}
  }
  package view Native(Value text){render inject Value,Kids @@children \`\`\`ts return <Tao.Text>{Value}</Tao.Text> \`\`\`}
  package let Shared=Caption
  package view FormattedDate(Value text) from ./FormattedDate.tsx
  tests "Source"{test(Label "Case"){run Demo press #child type "Set" into #child expect text "Ready" expect #child input value "Set" expect #child{text "Ready" input value "Set"} expect{text "Ready"}} test "Short"{} test(){} }
`

/** formattedSyntaxFixture pins canonical spacing and layout without changing source tokens. */
export const formattedSyntaxFixture = S`
  // Current syntax
  use tao@ui Col, Text
  use ./Shared Example
  use @cards Card as Panel, Heading
  use Local
  requires github:acme/widgets version v1.2.0 as Widgets
  requires npm:@date-fns/tz version 4.1.0

  ts-library Demo {
    publish {
      Root,
      @cards,
    }
  }

  file
  let Caption is text = "Hello"

  folder
  app Demo {
    root Root
  }

  package
  view Root(Title text, Subtitle text) {
    let Hidden = "Private"
    state Status is text = Title
    action Rename(Value text) {
      set Status = Value
    }
    action Save() {
      do Rename(Caption)
    }
    render #root UI.Col {
      #child
      Panel(Title, Caption)
      let Message = Hidden
      UI.Text(Message)
      UI.Button(Status) {
        on press Save
      }
      UI.Button(Subtitle) {
        on press -> do Rename(Title)
      }
    }
  }

  package
  view Native(Value text) {
    render inject Value, Kids @@children \`\`\`ts return <Tao.Text>{Value}</Tao.Text> \`\`\`
  }

  package
  let Shared = Caption

  package
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
  TypeScriptLibraryDeclaration: true,
  PublishDeclaration: true,
  SourceFile: true,
  _Declaration: true,
  _Statement: true,
  _Expression: true,
  _ViewRenderStatement: true,
  Block: true,
  AppDeclaration: true,
  RootDeclaration: true,
  ViewDeclaration: true,
  RenderInjectStatement: true,
  RenderViewExpressionStatement: true,
  ParameterList: true,
  Parameter: true,
  Injection: true,
  InjectionCapture: true,
  ContextReference: true,
  TypeScript: true,
  ViewRenderExpression: true,
  LetDeclaration: true,
  StateDeclaration: true,
  ActionDeclaration: true,
  SetStatement: true,
  DoStatement: true,
  PressBinding: true,
  InlineAction: true,
  UseStatement: true,
  NamedImport: true,
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
} satisfies Record<CST.NodeType, true>

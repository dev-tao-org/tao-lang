(AppDeclaration "app" @keyword)
(AppDeclaration name: (Identifier) @type)
(RootDeclaration "root" @keyword)
(ViewDeclaration "view" @keyword)
(ViewDeclaration name: (Identifier) @function)
(RenderInjectStatement "render" @keyword)
(RenderViewExpressionStatement "render" @keyword)
(Injection "inject" @keyword)
(Parameter type: (QualifiedName) @type)
(ViewRenderExpression view: (QualifiedName) @function)
(TestsDeclaration "tests" @keyword)
(TestDeclaration "test" @keyword)
(RunStatement "run" @keyword)
(RunStatement app: (QualifiedName) @type)
(PressStatement "press" @keyword)
(TypeStatement ["type" "into"] @keyword)
(ExpectStatement "expect" @keyword)
(RenderTag) @variable
(LetDeclaration ["let" "is"] @keyword)
(LetDeclaration name: (Identifier) @variable)
(LetDeclaration type: (QualifiedName) @type)
(StateDeclaration ["state" "is"] @keyword)
(StateDeclaration name: (Identifier) @variable)
(StateDeclaration type: (QualifiedName) @type)
(ActionDeclaration "action" @keyword)
(ActionDeclaration name: (Identifier) @function)
(FunctionDeclaration "func" @keyword)
(FunctionDeclaration name: (Identifier) @function)
(FunctionCall target: (QualifiedName) @function)
(ReturnStatement "return" @keyword)
(SetStatement "set" @keyword)
(DoStatement "do" @keyword)
(DoStatement target: (QualifiedName) @function)
(PressBinding ["on" "press"] @keyword)
(UseStatement "use" @keyword)
(TypeScriptLibraryDeclaration "ts-library" @keyword)
(TypeScriptLibraryDeclaration name: (Identifier) @type)
(PublishDeclaration "publish" @keyword)
(PublishDeclaration (Identifier) @type)
(NamedImport "as" @keyword)
(RequiresDeclaration ["requires" "version" "as"] @keyword)
(RequirementProvider) @type
(RequirementIdentifier) @string
(RequirementVersion) @string
(UseStatement (NamedImport target: (Identifier) @type))
(ImportPath) @string
(Visibility) @keyword
(QualifiedName) @type
(TextLiteral) @string
(TextSegment) @string
(Comment) @comment

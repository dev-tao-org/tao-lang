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
(Comment) @comment

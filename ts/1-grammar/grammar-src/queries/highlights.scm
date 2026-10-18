(AppDeclaration "app" @keyword)
(AppDeclaration name: (Identifier) @type)
(RootDeclaration "root" @keyword)
(ViewDeclaration "view" @keyword)
(ViewDeclaration name: (Identifier) @function)
(RenderStatement "render" @keyword)
(Injection "inject" @keyword)
(Parameter type: (QualifiedName) @type)
(ViewRender view: (QualifiedName) @function)
(TestsDeclaration "tests" @keyword)
(TestDeclaration "test" @keyword)
(RunStatement "run" @keyword)
(RunStatement app: (QualifiedName) @type)
(PressStatement "press" @keyword)
(TypeStatement ["type" "into"] @keyword)
(ExpectStatement "expect" @keyword)
(RenderTag) @variable
(LetDefinition ["let" "is"] @keyword)
(LetDefinition name: (Identifier) @variable)
(LetDefinition type: (QualifiedName) @type)
(UseStatement ["use" "from"] @keyword)
(All) @keyword
(UsePackageStatement ["use" "package" "from" "as"] @keyword)
(NamedImport "as" @keyword)
(UseStatement (NamedImport target: (Identifier) @type))
(ImportPath) @string
(Visibility) @keyword
(QualifiedName) @type
(TextLiteral) @string
(Comment) @comment

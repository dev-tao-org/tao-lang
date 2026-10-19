# Formatting and Fixing

Formatting changes whitespace without changing the meaning of Tao code. Fixing reorganizes source,
such as collecting imports, before formatting the result. Formatting runs on document save; fixes
are explicitly requested rather than applied on every save.

```tao
use Text, Col from tao@ui

public view Greeting(Title text, Subtitle text) {
render Col { Text(Title) Text(Subtitle) }
}
```

Formatting places visibility on its own line, indents bodies, and normalizes spaces and line breaks:

```tao
use Text, Col from tao@ui

public
view Greeting(Title text, Subtitle text) {
  render Col {
    Text(Title)
    Text(Subtitle)
  }
}
```

Formatting preserves an authored multiline argument or parameter list. An inline list stays inline
when it fits; when it exceeds the soft width of 120 columns, its items occupy separate indented lines:

```tao
view Welcome {
  render Greeting(
    "Welcome to your workspace",
    "Choose a document to continue"
  )
}
```

The formatter does not split Tao text literals to meet the width.
Nested render tags appear above their render line; root tags keep the current `render #tag View` form.
Comments stay with their surrounding code. Ordinary
statement gaps preserve up to one existing blank line; contextual rules require separation between
top-level declarations and remove empty padding immediately inside braces. Tao strings retain their contents.

Fenced TypeScript is formatted as TSX with the same width and indentation:

````tao
view Caption(Value text) {
  render inject Value ```ts
    return <TR.ReactNative.Text>{Value}</TR.ReactNative.Text>
  ```
}
````

Formatting preserves meaningful whitespace inside multiline literals. An incomplete TypeScript body
is left unchanged while complete surrounding Tao syntax can still be formatted.

Long named-import lists use a hanging indent, with their source on the following line:

```tao
use FirstView,
  SecondView,
  ThirdView
from @example/ui
```

Fixing can combine compatible imports, remove exact duplicates, and sort selected names and sources:

```tao
use Text from tao@ui
use Col from tao@ui
use Text from tao@ui
```

```tao
use Col, Text from tao@ui
```

Aliases remain aliases. Comments travel with their imports, and comment-separated groups are kept
separate where combining them would lose their grouping.

`tao fix` warns about unused named imports, package namespaces, private declarations and local
bindings. It retains them all: a declaration may be work in progress. References respect lexical
shadowing, qualified names and explicit native captures. Wildcard imports receive no per-export
warnings, and declarations visible to other files are not declared unused from a single-file check.

```tao
use Text, Col from tao@ui

app Example { root Main }
view Main { render Text("Hello") }
```

Fixing this file reports that `Col` is unused, while keeping the import. Warning locations refer to
the final, formatted source. This local usage analysis does not require imported modules to resolve
and does not replace full type checking.

While a document is incomplete, formatting applies only to complete top-level declarations. An
unfinished declaration and uncertain whitespace around it are left alone:

```tao
view Greeting {
  render Text("Hello")
}

view BeingEdited(
```

Fixing requires syntactically complete source. Import organization works even when imported modules
cannot be resolved; future semantic fixes can require resolved references.

`tao fmt path/to/File.tao` formats one source file and
`tao fix path/to/File.tao` organizes its imports before formatting. Editor format-on-save uses the
same formatting behavior.

# Formatting and Fixing

Formatting changes whitespace without changing the meaning of Tao code. Fixing reorganizes source,
such as collecting imports, before formatting the result. Formatting runs on document save; fixes
are explicitly requested rather than applied on every save.

```tao
use Text, Col from @tao/ui

public view Greeting(Title text, Subtitle text) {
render Col { Text(Title) Text(Subtitle) }
}
```

Formatting places visibility on its own line, indents bodies, and normalizes spaces and line breaks:

```tao
use Text, Col from @tao/ui

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

The formatter does not split text literals or rewrite fenced TypeScript injections to meet the width.
Nested render tags appear above their render line; root tags keep the current `render #tag View` form.
Comments stay with their surrounding code. Ordinary
statement gaps preserve up to one existing blank line; contextual rules require separation between
top-level declarations and remove empty padding immediately inside braces. Strings and injected code
retain their contents.

Long named-import lists use a hanging indent, with their source on the following line:

```tao
use FirstView,
  SecondView,
  ThirdView
from @example/ui
```

Fixing can combine compatible imports, remove exact duplicates, and sort selected names and sources:

```tao
use Text from @tao/ui
use Col from @tao/ui
use Text from @tao/ui
```

```tao
use Col, Text from @tao/ui
```

Aliases remain aliases. Comments travel with their imports, and comment-separated groups are kept
separate where combining them would lose their grouping. Unused imports are retained; removing them
requires semantic usage analysis beyond this first organizer.

While a document is incomplete, formatting applies only to complete top-level declarations. An
unfinished declaration and uncertain whitespace around it are left alone:

```tao
view Greeting {
  render Text("Hello")
}

view BeingEdited(
```

Fixing requires a complete AST. Syntactic fixes such as import organization do not require successful
name resolution; future semantic fixes can require resolved references. Both operations propose
source edits without mutating the supplied tree or writing files. The editor or command applies those
edits to the matching document version and decides when to save.

`./tao fmt path/to/File.tao` formats one source file and
`./tao fix path/to/File.tao` organizes its imports before formatting. Repository commands `./dev fmt`
and `./dev fix` accept explicit Tao file paths too. The extension supplies the same
formatting operation to the editor's format-on-save support.

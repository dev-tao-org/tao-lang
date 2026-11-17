# Formatting and Fixing WIP

Formatting normalizes Tao layout without changing meaning; explicitly requested fixing reorganizes imports and reports unused bindings.

```tao
use tao@ui Text, Col

package
view Greeting(Title text, Subtitle text) {
  render Col {
    Text(Title)
    Text(Subtitle)
  }
}

view Welcome {
  render Greeting(
    "Welcome to your workspace",
    "Choose a document to continue"
  )
}
```

#### Formatting

Visibility occupies its own line; bodies use two-space indentation. Inline argument and parameter
lists stay inline when they fit, while authored multiline lists remain multiline. Lists exceeding
the soft width of 120 columns use separate indented lines; text literals are not split.

#### Tags, comments and spacing

Nested render tags appear above their render line; root tags keep `render #tag View`. Comments
stay with surrounding code. Statement gaps retain at most one existing blank line; top-level
declarations are separated and padding immediately inside braces is removed. String contents stay
unchanged.

#### Embedded TypeScript

Fenced TypeScript is formatted as TSX with the same width and indentation, preserving meaningful
literal whitespace. An incomplete TypeScript body stays unchanged while complete surrounding Tao
syntax can still be formatted.

#### `use tao@ui Col, Text`

Fixing combines compatible imports, removes exact duplicates, and sorts selected names and
sources. Aliases and comment-separated groups remain intact. Long named-import lists use a hanging
indent after `use <source> FirstName,` on the first line.

#### Unused bindings

Fixing warns about unused named imports, private declarations and local bindings without deleting
them. References respect lexical shadowing and explicit native captures. Single-file checks do
not call declarations unused when other files can access them. Warning locations refer to formatted
source.

#### Incomplete source

Formatting handles complete top-level declarations and preserves unfinished declarations and
uncertain surrounding whitespace. Fixing requires syntactically complete source; import
organization and local usage analysis do not require imports to resolve or replace type checking.

#### `tao fmt` and `tao fix`

`tao fmt path/to/File.tao` formats a file. Pass a Tao project directory or one inside it to format its Tao files recursively,
skipping dependency and generated directories. `tao fix path/to/File.tao` organizes imports before
formatting. Editor format-on-save uses the same formatting behavior without applying fixes.

# Source tools

The [Formatting and Fixing specification](../Specification/Formatting%20and%20Fixing.md) describes
the language-facing behavior. This guide describes the repository integration.

`ts/4-fix/` owns the formatter/fixer libraries and Tao rules. Formatting works from the CST and can
format complete top-level declarations in an incomplete document. Fixing requires a complete AST;
syntactic import organization does not require successful name resolution. Future semantic fixes
can require resolved references. Fixes run before formatting.

Both operations return proposed source edits without mutating the supplied tree or writing files.
The editor or CLI applies edits only to the matching document version and owns persistence.
Formatting is performed on save or explicit request, outside the preview compilation path.

Embedded TypeScript uses the native TSX formatter, loaded on first use and reused. Its starting
indentation preserves meaningful whitespace inside multiline literals. Incomplete native bodies
are left unchanged while complete surrounding Tao syntax can still be formatted.

```sh
./tao fmt path/to/File.tao
./tao fix path/to/File.tao
./dev fmt path/to/File.tao
./dev fix path/to/File.tao
```

The repository commands also accept explicit Tao paths. Without explicit paths their scope includes
repository sources. The extension supplies the same Tao formatting operation to editor format-on-save.
Use `./agent fmt` or `./agent fix` for the corresponding agent workflows.

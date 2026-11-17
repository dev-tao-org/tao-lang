import * as TR from '@tao/runtime/generated';
import * as _Views from "./Demo.views";

import type { Scope as ImportedScope0 } from "../../../dependencies/tao/@ui/Views";

export type Scope = {
  readonly "LibraryGreeting": TR.View;
  readonly "Col": ImportedScope0["Col"];
  readonly "Text": ImportedScope0["Text"];
};

export type Imports = {
  readonly "Col": Pick<ImportedScope0, "Col">;
  readonly "Text": Pick<ImportedScope0, "Text">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Col", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Col"]);
  TR.AliasBinding(_Scope, "Text", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Text"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "LibraryGreeting", TR.ViewDeclaration("LibraryGreeting", ["First", "Second"], _Views.TaoView_LibraryGreeting_8cfe0e533c18, _Scope));
}
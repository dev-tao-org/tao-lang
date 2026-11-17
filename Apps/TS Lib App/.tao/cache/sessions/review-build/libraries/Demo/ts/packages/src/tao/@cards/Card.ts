import * as TR from '@tao/runtime/generated';
import * as _Views from "./Card.views";

import type { Scope as ImportedScope0 } from "../../../../dependencies/tao/@ui/Views";

export type Scope = {
  readonly "Caption": TR.View;
  readonly "Text": ImportedScope0["Text"];
};

export type Imports = {
  readonly "Text": Pick<ImportedScope0, "Text">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Text", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Text"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "Caption", TR.ViewDeclaration("Caption", ["Value"], _Views.TaoView_Caption_8f59ed3528dc, _Scope));
}
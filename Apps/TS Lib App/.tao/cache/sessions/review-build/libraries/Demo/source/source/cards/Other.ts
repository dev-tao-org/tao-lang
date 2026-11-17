import * as TR from '@runtime';
import * as _Views from "./Other.views";

import type { Scope as ImportedScope0 } from "../../tao/ui/Views";

export type Scope = {
  readonly "Unselected": TR.View;
  readonly "Text": ImportedScope0["Text"];
};

export type Imports = {
  readonly "Text": Pick<ImportedScope0, "Text">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]!["Text"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "Unselected", TR.ViewDeclaration("Unselected", [], _Views.TaoView_Unselected_2581cb783d90, _Scope));
}
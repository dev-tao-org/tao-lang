import * as TR from '@runtime';
import * as _Views from "./ValueSnapshots.views";

import type { Scope as ImportedScope0 } from "./ScopeExamples";

export type Scope = {
  readonly "ValueSnapshots": TR.View;
  readonly "FolderScope": ImportedScope0["FolderScope"];
};

export type Imports = {
  readonly "FolderScope": Pick<ImportedScope0, "FolderScope">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "FolderScope", () => _Modules["source/ScopeExamples.ts"]!["FolderScope"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "ValueSnapshots", TR.ViewDeclaration("ValueSnapshots", [], _Views.TaoView_ValueSnapshots_c2010549d29d, _Scope));
}
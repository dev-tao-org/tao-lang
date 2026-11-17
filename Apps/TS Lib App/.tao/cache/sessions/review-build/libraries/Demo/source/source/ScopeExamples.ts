import * as TR from '@runtime';
import * as _Views from "./ScopeExamples.views";

import type { Scope as ImportedScope0 } from "../tao/ui/Views";

export type Scope = {
  readonly "FolderScope": TR.View;
  readonly "PackageScope": TR.View;
  readonly "ProjectScope": TR.View;
  readonly "Text": ImportedScope0["Text"];
};

export type Imports = {
  readonly "Text": Pick<ImportedScope0, "Text">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]!["Text"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "FolderScope", TR.ViewDeclaration("FolderScope", [], _Views.TaoView_FolderScope_fe31eee072dc, _Scope));
  TR.LetDeclaration(_Scope, "PackageScope", TR.ViewDeclaration("PackageScope", [], _Views.TaoView_PackageScope_fe31eee072dc, _Scope));
  TR.LetDeclaration(_Scope, "ProjectScope", TR.ViewDeclaration("ProjectScope", [], _Views.TaoView_ProjectScope_fe31eee072dc, _Scope));
}
import * as TR from '@tao/runtime/generated';
import * as _Views from "./Library.views";

import type { Scope as ImportedScope0 } from "../../../dependencies/tao/@ui/Views";
import type { Scope as ImportedScope1 } from "./LanguageFeatures";
import type { Scope as ImportedScope2 } from "./ValueSnapshots";
import type { Scope as ImportedScope3 } from "./ScopeExamples";

export type Scope = {
  readonly "Greeting": TR.View;
  readonly "Panel": TR.View;
  readonly "Hidden": TR.View;
  readonly "Col": ImportedScope0["Col"];
  readonly "Text": ImportedScope0["Text"];
  readonly "LanguageFeatures": ImportedScope1["LanguageFeatures"];
  readonly "ScoreReadout": ImportedScope1["ScoreReadout"];
  readonly "ValueSnapshots": ImportedScope2["ValueSnapshots"];
  readonly "FolderScope": ImportedScope3["FolderScope"];
};

export type Imports = {
  readonly "Col": Pick<ImportedScope0, "Col">;
  readonly "Text": Pick<ImportedScope0, "Text">;
  readonly "LanguageFeatures": Pick<ImportedScope1, "LanguageFeatures">;
  readonly "ScoreReadout": Pick<ImportedScope1, "ScoreReadout">;
  readonly "ValueSnapshots": Pick<ImportedScope2, "ValueSnapshots">;
  readonly "FolderScope": Pick<ImportedScope3, "FolderScope">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Col", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Col"]);
  TR.AliasBinding(_Scope, "Text", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "LanguageFeatures", () => _Modules["ts/packages/src/tao/LanguageFeatures.ts"]!["LanguageFeatures"]);
  TR.AliasBinding(_Scope, "ScoreReadout", () => _Modules["ts/packages/src/tao/LanguageFeatures.ts"]!["ScoreReadout"]);
  TR.AliasBinding(_Scope, "ValueSnapshots", () => _Modules["ts/packages/src/tao/ValueSnapshots.ts"]!["ValueSnapshots"]);
  TR.AliasBinding(_Scope, "FolderScope", () => _Modules["ts/packages/src/tao/ScopeExamples.ts"]!["FolderScope"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "Greeting", TR.ViewDeclaration("Greeting", ["First", "Second"], _Views.TaoView_Greeting_1d5cb05c2553, _Scope));
  TR.LetDeclaration(_Scope, "Panel", TR.ViewDeclaration("Panel", [], _Views.TaoView_Panel_1d5cb05c2553, _Scope));
  TR.LetDeclaration(_Scope, "Hidden", TR.ViewDeclaration("Hidden", [], _Views.TaoView_Hidden_1d5cb05c2553, _Scope));
}
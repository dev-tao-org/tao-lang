import * as TR from '@runtime';
import * as _Views from "./Library.views";

import type { Scope as ImportedScope0 } from "../tao/ui/Views";
import type { Scope as ImportedScope1 } from "./cards/Card";
import type { Scope as ImportedScope2 } from "./cards/Other";
import type { Scope as ImportedScope3 } from "./LanguageFeatures";
import type { Scope as ImportedScope4 } from "./ValueSnapshots";
import type { Scope as ImportedScope5 } from "./ScopeExamples";

export type Scope = {
  readonly "Greeting": TR.View;
  readonly "Panel": TR.View;
  readonly "Hidden": TR.View;
  readonly "Col": ImportedScope0["Col"];
  readonly "Text": ImportedScope0["Text"];
  readonly "Cards.Caption": ImportedScope1["Caption"];
  readonly "Cards.Unselected": ImportedScope2["Unselected"];
  readonly "LanguageFeatures": ImportedScope3["LanguageFeatures"];
  readonly "ValueSnapshots": ImportedScope4["ValueSnapshots"];
  readonly "FolderScope": ImportedScope5["FolderScope"];
};

export type Imports = {
  readonly "Col": Pick<ImportedScope0, "Col">;
  readonly "Text": Pick<ImportedScope0, "Text">;
  readonly "Cards.Caption": Pick<ImportedScope1, "Caption">;
  readonly "Cards.Unselected": Pick<ImportedScope2, "Unselected">;
  readonly "LanguageFeatures": Pick<ImportedScope3, "LanguageFeatures">;
  readonly "ValueSnapshots": Pick<ImportedScope4, "ValueSnapshots">;
  readonly "FolderScope": Pick<ImportedScope5, "FolderScope">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Col", () => _Modules["tao/ui/Views.ts"]!["Col"]);
  TR.AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "Cards.Caption", () => _Modules["source/cards/Card.ts"]!["Caption"]);
  TR.AliasBinding(_Scope, "Cards.Unselected", () => _Modules["source/cards/Other.ts"]!["Unselected"]);
  TR.AliasBinding(_Scope, "LanguageFeatures", () => _Modules["source/LanguageFeatures.ts"]!["LanguageFeatures"]);
  TR.AliasBinding(_Scope, "ValueSnapshots", () => _Modules["source/ValueSnapshots.ts"]!["ValueSnapshots"]);
  TR.AliasBinding(_Scope, "FolderScope", () => _Modules["source/ScopeExamples.ts"]!["FolderScope"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "Greeting", TR.ViewDeclaration("Greeting", ["First", "Second"], _Views.TaoView_Greeting_83e89515fb8e, _Scope));
  TR.LetDeclaration(_Scope, "Panel", TR.ViewDeclaration("Panel", [], _Views.TaoView_Panel_83e89515fb8e, _Scope));
  TR.LetDeclaration(_Scope, "Hidden", TR.ViewDeclaration("Hidden", [], _Views.TaoView_Hidden_83e89515fb8e, _Scope));
}
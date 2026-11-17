import * as TR from '@runtime';
import * as _Views from "./LanguageFeatures.views";
import { ForeignGreeting as _taoForeignView0 } from "/private/tmp/tao-read-only-observation/Apps/TS Lib App/src/ts/ForeignGreeting.tsx";
import type { Scope as ImportedScope0 } from "../tao/ui/Views";
import type { Scope as ImportedScope1 } from "./cards/Card";
import type { Scope as ImportedScope2 } from "./cards/Other";
import type { Scope as ImportedScope3 } from "./ScopeExamples";

export type Scope = {
  readonly "FileCaption": string;
  readonly "EscapedCaption": string;
  readonly "LanguageFeatures": TR.View;
  readonly "ForeignGreeting": TR.View;
  readonly "Text": ImportedScope0["Text"];
  readonly "Col": ImportedScope0["Col"];
  readonly "Row": ImportedScope0["Row"];
  readonly "Input": ImportedScope0["Input"];
  readonly "AliasText": ImportedScope0["Text"];
  readonly "Caption": ImportedScope1["Caption"];
  readonly "Cards.Caption": ImportedScope1["Caption"];
  readonly "Cards.Unselected": ImportedScope2["Unselected"];
  readonly "FolderScope": ImportedScope3["FolderScope"];
  readonly "PackageScope": ImportedScope3["PackageScope"];
  readonly "ProjectScope": ImportedScope3["ProjectScope"];
};

export type Imports = {
  readonly "Text": Pick<ImportedScope0, "Text">;
  readonly "Col": Pick<ImportedScope0, "Col">;
  readonly "Row": Pick<ImportedScope0, "Row">;
  readonly "Input": Pick<ImportedScope0, "Input">;
  readonly "AliasText": Pick<ImportedScope0, "Text">;
  readonly "Caption": Pick<ImportedScope1, "Caption">;
  readonly "Cards.Caption": Pick<ImportedScope1, "Caption">;
  readonly "Cards.Unselected": Pick<ImportedScope2, "Unselected">;
  readonly "FolderScope": Pick<ImportedScope3, "FolderScope">;
  readonly "PackageScope": Pick<ImportedScope3, "PackageScope">;
  readonly "ProjectScope": Pick<ImportedScope3, "ProjectScope">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "Col", () => _Modules["tao/ui/Views.ts"]!["Col"]);
  TR.AliasBinding(_Scope, "Row", () => _Modules["tao/ui/Views.ts"]!["Row"]);
  TR.AliasBinding(_Scope, "Input", () => _Modules["tao/ui/Views.ts"]!["Input"]);
  TR.AliasBinding(_Scope, "AliasText", () => _Modules["tao/ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "Caption", () => _Modules["source/cards/Card.ts"]!["Caption"]);
  TR.AliasBinding(_Scope, "Cards.Caption", () => _Modules["source/cards/Card.ts"]!["Caption"]);
  TR.AliasBinding(_Scope, "Cards.Unselected", () => _Modules["source/cards/Other.ts"]!["Unselected"]);
  TR.AliasBinding(_Scope, "FolderScope", () => _Modules["source/ScopeExamples.ts"]!["FolderScope"]);
  TR.AliasBinding(_Scope, "PackageScope", () => _Modules["source/ScopeExamples.ts"]!["PackageScope"]);
  TR.AliasBinding(_Scope, "ProjectScope", () => _Modules["source/ScopeExamples.ts"]!["ProjectScope"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "LanguageFeatures", TR.ViewDeclaration("LanguageFeatures", ["Name"], _Views.TaoView_LanguageFeatures_4cc323e18c85, _Scope));
  TR.LetDeclaration(_Scope, "ForeignGreeting", TR.ForeignView("ForeignGreeting", ["Value"], _taoForeignView0, _Scope));
}

export function initializeFileCaption(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "FileCaption", "File-scoped text");
}

export function initializeEscapedCaption(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "EscapedCaption", "Escaped \"text\", backslash \\ and Unicode ☺");
}
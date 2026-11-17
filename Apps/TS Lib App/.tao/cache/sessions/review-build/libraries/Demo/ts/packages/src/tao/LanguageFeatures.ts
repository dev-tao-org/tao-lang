import * as TR from '@tao/runtime/generated';
import * as _Views from "./LanguageFeatures.views";
import { ForeignGreeting as _taoForeignView0 } from "../../../sidecars/1/src/ts/ForeignGreeting";
import type { Scope as ImportedScope0 } from "../../../dependencies/tao/@ui/Views";
import type { Scope as ImportedScope1 } from "./@cards/Card";
import type { Scope as ImportedScope2 } from "./ScopeExamples";

export type Scope = {
  readonly "FileCaption": string;
  readonly "EscapedCaption": string;
  readonly "LanguageFeatures": TR.View;
  readonly "ForeignGreeting": TR.View;
  readonly "Button": ImportedScope0["Button"];
  readonly "Col": ImportedScope0["Col"];
  readonly "Input": ImportedScope0["Input"];
  readonly "Text": ImportedScope0["Text"];
  readonly "AliasText": ImportedScope0["Text"];
  readonly "Caption": ImportedScope1["Caption"];
  readonly "PackageCaption": ImportedScope1["Caption"];
  readonly "FolderScope": ImportedScope2["FolderScope"];
  readonly "PackageScope": ImportedScope2["PackageScope"];
  readonly "ProjectScope": ImportedScope2["ProjectScope"];
};

export type Imports = {
  readonly "Button": Pick<ImportedScope0, "Button">;
  readonly "Col": Pick<ImportedScope0, "Col">;
  readonly "Input": Pick<ImportedScope0, "Input">;
  readonly "Text": Pick<ImportedScope0, "Text">;
  readonly "AliasText": Pick<ImportedScope0, "Text">;
  readonly "Caption": Pick<ImportedScope1, "Caption">;
  readonly "PackageCaption": Pick<ImportedScope1, "Caption">;
  readonly "FolderScope": Pick<ImportedScope2, "FolderScope">;
  readonly "PackageScope": Pick<ImportedScope2, "PackageScope">;
  readonly "ProjectScope": Pick<ImportedScope2, "ProjectScope">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Button", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Button"]);
  TR.AliasBinding(_Scope, "Col", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Col"]);
  TR.AliasBinding(_Scope, "Input", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Input"]);
  TR.AliasBinding(_Scope, "Text", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "AliasText", () => _Modules["ts/dependencies/tao/@ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "Caption", () => _Modules["ts/packages/src/tao/@cards/Card.ts"]!["Caption"]);
  TR.AliasBinding(_Scope, "PackageCaption", () => _Modules["ts/packages/src/tao/@cards/Card.ts"]!["Caption"]);
  TR.AliasBinding(_Scope, "FolderScope", () => _Modules["ts/packages/src/tao/ScopeExamples.ts"]!["FolderScope"]);
  TR.AliasBinding(_Scope, "PackageScope", () => _Modules["ts/packages/src/tao/ScopeExamples.ts"]!["PackageScope"]);
  TR.AliasBinding(_Scope, "ProjectScope", () => _Modules["ts/packages/src/tao/ScopeExamples.ts"]!["ProjectScope"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "LanguageFeatures", TR.ViewDeclaration("LanguageFeatures", ["Name"], _Views.TaoView_LanguageFeatures_f61fcef90f44, _Scope));
  TR.LetDeclaration(_Scope, "ForeignGreeting", TR.ForeignView("ForeignGreeting", ["Value"], _taoForeignView0, _Scope));
}

export function initializeFileCaption(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "FileCaption", "File-scoped text");
}

export function initializeEscapedCaption(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "EscapedCaption", "Escaped \"text\", backslash \\ and Unicode ☺");
}
import * as TR from '@runtime';
import * as _Views from "./Kitchen Sink.views";
import { SidecarGreeting as _taoForeignView0 } from "/Users/ro/.codex/worktrees/4f3f/tao-lang/Apps/Dev/.tao/cache/sessions/review-build/foreign-views/a3f0c478eae96ffbd2895e1d0c8ae3a46998902a9844ee67c51895529b84a164/modules/0d1d0a24874c55bf/Kitchen Sink/SidecarGreeting.tsx";
import type { Scope as ImportedScope0 } from "../tao/ui/Views";
import type { Scope as ImportedScope1 } from "./Modules";
import type { Scope as ImportedScope2 } from "./Library/Demo";

export type Scope = {
  readonly "DefaultTitle": string;
  readonly "KitchenSink": TR.View;
  readonly "RootView": TR.View;
  readonly "InteractionStatus": TR.View;
  readonly "Pair": TR.View;
  readonly "Panel": TR.View;
  readonly "Heading": TR.View;
  readonly "SaveButton": TR.View;
  readonly "SidecarGreeting": TR.View;
  readonly "Text": ImportedScope0["Text"];
  readonly "Col": ImportedScope0["Col"];
  readonly "Row": ImportedScope0["Row"];
  readonly "Input": ImportedScope0["Input"];
  readonly "ModuleCaption": ImportedScope1["ModuleCaption"];
  readonly "Caption": ImportedScope0["Text"];
  readonly "UI.Text": ImportedScope0["Text"];
  readonly "UI.Col": ImportedScope0["Col"];
  readonly "UI.Row": ImportedScope0["Row"];
  readonly "UI.Input": ImportedScope0["Input"];
  readonly "ImportedCaption": ImportedScope1["ModuleCaption"];
  readonly "Modules.ModuleCaption": ImportedScope1["ModuleCaption"];
  readonly "LibraryGreeting": ImportedScope2["LibraryGreeting"];
};

export type Imports = {
  readonly "Text": Pick<ImportedScope0, "Text">;
  readonly "Col": Pick<ImportedScope0, "Col">;
  readonly "Row": Pick<ImportedScope0, "Row">;
  readonly "Input": Pick<ImportedScope0, "Input">;
  readonly "ModuleCaption": Pick<ImportedScope1, "ModuleCaption">;
  readonly "Caption": Pick<ImportedScope0, "Text">;
  readonly "UI.Text": Pick<ImportedScope0, "Text">;
  readonly "UI.Col": Pick<ImportedScope0, "Col">;
  readonly "UI.Row": Pick<ImportedScope0, "Row">;
  readonly "UI.Input": Pick<ImportedScope0, "Input">;
  readonly "ImportedCaption": Pick<ImportedScope1, "ModuleCaption">;
  readonly "Modules.ModuleCaption": Pick<ImportedScope1, "ModuleCaption">;
  readonly "LibraryGreeting": Pick<ImportedScope2, "LibraryGreeting">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "Text", () => _Modules["tao/ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "Col", () => _Modules["tao/ui/Views.ts"]!["Col"]);
  TR.AliasBinding(_Scope, "Row", () => _Modules["tao/ui/Views.ts"]!["Row"]);
  TR.AliasBinding(_Scope, "Input", () => _Modules["tao/ui/Views.ts"]!["Input"]);
  TR.AliasBinding(_Scope, "ModuleCaption", () => _Modules["source/Modules.ts"]!["ModuleCaption"]);
  TR.AliasBinding(_Scope, "Caption", () => _Modules["tao/ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "UI.Text", () => _Modules["tao/ui/Views.ts"]!["Text"]);
  TR.AliasBinding(_Scope, "UI.Col", () => _Modules["tao/ui/Views.ts"]!["Col"]);
  TR.AliasBinding(_Scope, "UI.Row", () => _Modules["tao/ui/Views.ts"]!["Row"]);
  TR.AliasBinding(_Scope, "UI.Input", () => _Modules["tao/ui/Views.ts"]!["Input"]);
  TR.AliasBinding(_Scope, "ImportedCaption", () => _Modules["source/Modules.ts"]!["ModuleCaption"]);
  TR.AliasBinding(_Scope, "Modules.ModuleCaption", () => _Modules["source/Modules.ts"]!["ModuleCaption"]);
  TR.AliasBinding(_Scope, "LibraryGreeting", () => _Modules["source/Library/Demo.ts"]!["LibraryGreeting"]);
}

export function bindDeclarations(_Scope: Scope): void {
  TR.AliasBinding(_Scope, "KitchenSink", () => _Scope["RootView"]);
  TR.LetDeclaration(_Scope, "RootView", TR.ViewDeclaration("RootView", [], _Views.TaoView_RootView_da9ad98e2365, _Scope));
  TR.LetDeclaration(_Scope, "InteractionStatus", TR.ViewDeclaration("InteractionStatus", ["Locked"], _Views.TaoView_InteractionStatus_da9ad98e2365, _Scope));
  TR.LetDeclaration(_Scope, "Pair", TR.ViewDeclaration("Pair", ["First", "Second"], _Views.TaoView_Pair_da9ad98e2365, _Scope));
  TR.LetDeclaration(_Scope, "Panel", TR.ViewDeclaration("Panel", ["Title"], _Views.TaoView_Panel_da9ad98e2365, _Scope));
  TR.LetDeclaration(_Scope, "Heading", TR.ViewDeclaration("Heading", [], _Views.TaoView_Heading_da9ad98e2365, _Scope));
  TR.LetDeclaration(_Scope, "SaveButton", TR.ViewDeclaration("SaveButton", [], _Views.TaoView_SaveButton_da9ad98e2365, _Scope));
  TR.LetDeclaration(_Scope, "SidecarGreeting", TR.ForeignView("SidecarGreeting", ["Value"], _taoForeignView0, _Scope));
}

export function initializeDefaultTitle(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "DefaultTitle", "Kitchen Sink");
}
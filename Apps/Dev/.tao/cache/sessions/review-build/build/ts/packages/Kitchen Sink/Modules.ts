import * as TR from '@runtime';


import type { Scope as ImportedScope0 } from "./Kitchen Sink";

export type Scope = {
  readonly "ModuleCaption": string;
  readonly "KitchenSink": ImportedScope0["KitchenSink"];
  readonly "Pair": ImportedScope0["Pair"];
};

export type Imports = {
  readonly "KitchenSink": Pick<ImportedScope0, "KitchenSink">;
  readonly "Pair": Pick<ImportedScope0, "Pair">;
};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
  TR.AliasBinding(_Scope, "KitchenSink", () => _Modules["ts/packages/Kitchen Sink/Kitchen Sink.ts"]!["KitchenSink"]);
  TR.AliasBinding(_Scope, "Pair", () => _Modules["ts/packages/Kitchen Sink/Kitchen Sink.ts"]!["Pair"]);
}

export function bindDeclarations(_Scope: Scope): void {

}

export function initializeModuleCaption(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "ModuleCaption", "Imported from a sibling module");
}
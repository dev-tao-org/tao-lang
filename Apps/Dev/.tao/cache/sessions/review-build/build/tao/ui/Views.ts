import * as TR from '@runtime';
import * as _Views from "./Views.views";



export type Scope = {
  readonly "Text": TR.View;
  readonly "Col": TR.View;
  readonly "Row": TR.View;
  readonly "Input": TR.View;
};

export type Imports = {

};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {

}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "Text", TR.ViewDeclaration("Text", ["Value"], _Views.TaoView_Text_8da6fc2c7acb, _Scope));
  TR.LetDeclaration(_Scope, "Col", TR.ViewDeclaration("Col", [], _Views.TaoView_Col_8da6fc2c7acb, _Scope));
  TR.LetDeclaration(_Scope, "Row", TR.ViewDeclaration("Row", [], _Views.TaoView_Row_8da6fc2c7acb, _Scope));
  TR.LetDeclaration(_Scope, "Input", TR.ViewDeclaration("Input", ["Value"], _Views.TaoView_Input_8da6fc2c7acb, _Scope));
}
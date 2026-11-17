import * as TR from '@tao/runtime/generated';




export type Scope = {
  readonly "FormatCaption": TR.TextFunction;
  readonly "JoinCaption": TR.TextFunction;
};

export type Imports = {

};

export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {

}

export function bindDeclarations(_Scope: Scope): void {
  TR.LetDeclaration(_Scope, "FormatCaption", TR.FunctionDeclaration(_Scope, ["Value"], _Scope => TR.FunctionCall(_Scope["JoinCaption"], [["Value", _Scope["Value"]], ["Prefix", "Aliased capture: "]])));
  TR.LetDeclaration(_Scope, "JoinCaption", TR.FunctionDeclaration(_Scope, ["Prefix", "Value"], _Scope => TR.InterpolatedText([_Scope["Prefix"], _Scope["Value"]])));
}
// Node binding follows Tree-sitter's MIT-licensed language binding protocol:
// https://github.com/tree-sitter/tree-sitter-json/blob/master/bindings/node/binding.cc
#include <napi.h>

typedef struct TSLanguage TSLanguage;
extern "C" TSLanguage *tree_sitter_tao();

// Tree-sitter's required language type tag.
const napi_type_tag LANGUAGE_TYPE_TAG = {
  0x8AF2E5212AD58ABF, 0xD5006CAD83ABBA16
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports["name"] = Napi::String::New(env, "tao");
  auto language = Napi::External<TSLanguage>::New(env, tree_sitter_tao());
  language.TypeTag(&LANGUAGE_TYPE_TAG);
  exports["language"] = language;
  return exports;
}

NODE_API_MODULE(tree_sitter_tao_binding, Init)

{
  'targets': [{
    'target_name': 'tree_sitter_tao_binding',
    'include_dirs': ['src', '<!(node -p "require(\'node-addon-api\').include_dir")'],
    'defines': ['NAPI_DISABLE_CPP_EXCEPTIONS'],
    'sources': ['binding.cc', 'src/parser.c', 'src/scanner.c'],
    'cflags_c': ['-std=c11'],
    'xcode_settings': { 'MACOSX_DEPLOYMENT_TARGET': '13.5' },
  }],
}

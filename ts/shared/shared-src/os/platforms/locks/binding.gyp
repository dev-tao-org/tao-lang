{
  'targets': [{
    'target_name': 'tao_os_locks',
    'include_dirs': ['<!(node -p "require(\'node-addon-api\').include_dir")'],
    'defines': ['NAPI_DISABLE_CPP_EXCEPTIONS'],
    'sources': ['FileLock.cc'],
    'xcode_settings': { 'MACOSX_DEPLOYMENT_TARGET': '13.5' },
  }],
}

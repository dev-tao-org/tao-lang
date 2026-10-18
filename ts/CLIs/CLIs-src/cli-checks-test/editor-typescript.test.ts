import { Platform, Tests } from '@shared/os'
import * as TypeScript from 'typescript'
import { assertEditorTypeScript } from '../cli-checks/editor-typescript'

Tests.test('check rejects stale editor SDK paths and compiler version drift', () => {
  const stale = '{ "typescript.tsdk": "ts/node_modules/typescript/lib" }'
  const missing = JSON.stringify({ 'typescript.tsdk': `.artifacts/tmp/missing-sdk-${Platform.randomUUID()}/lib` })
  Tests.throws(() => assertEditorTypeScript(missing), /Editor TypeScript SDK is missing/)
  Tests.throws(() => assertEditorTypeScript(stale, () => '5.3.0-dev.20230808'), /differs from check/)
  const settings = '{ "typescript.tsdk": "ts/CLIs/node_modules/typescript/lib" }'
  assertEditorTypeScript(settings, () => TypeScript.version)
})

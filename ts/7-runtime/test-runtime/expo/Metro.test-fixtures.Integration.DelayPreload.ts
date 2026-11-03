import { Json, S } from '@shared'

/** delayPreload creates test-only Metro barriers and can inject a premature publication result. */
export function delayPreload(preloadPath: string, publishBeforeAdmission = false): string {
  return S`
    const production = require(${Json.Print(preloadPath)});
    const fs = require('node:fs');
    const path = require('node:path');
    const { createRequire } = require('node:module');
    const app = createRequire(path.join(process.cwd(), 'package.json'));
    const expo = createRequire(app.resolve('expo/package.json'));
    const cli = createRequire(expo.resolve('@expo/cli/package.json'));
    const Bundler = cli('@expo/metro/metro/Bundler').default;
    const transform = Bundler.prototype.transformFile;
    const state = { armed: false, held: false, before: '', after: '', fail: false, publicationRequests: 0, sourceRequests: 0 };
    let release;
    ${sourceReadBarrier}
    ${precommitFailure}
    exports.enhanceMiddleware = (middleware, metro) => {
      const owned = production.enhanceMiddleware(middleware, metro);
      return (req, res, next) => {
        if (req.url === '/__tao_test/arm') { state.armed = true; state.held = false; state.publicationRequests = 0; state.sourceRequests = 0; res.end('armed'); }
        else if (req.url === '/__tao_test/release') { release(); res.end('released'); }
        else if (req.url === '/__tao_test/fail') { state.fail = true; res.end('failure armed'); }
        else if (req.url === '/__tao_test/poison') { ${postcommitFailure} }
        else if (req.url === '/__tao_test/status') { res.end(JSON.stringify({ ...state, rss: process.memoryUsage().rss })); }
        else if (req.url === '/__tao/publish') { ${
    publishBeforeAdmission ? prematurePublication : standardPublication
  } }
        else if (decodeURIComponent(req.url.split('?')[0]).endsWith('/src/App.tsx')) { owned(req, res, next); state.sourceRequests += 1; }
        else owned(req, res, next);
      };
    };
  `
}

const standardPublication = S`
  owned(req, res, next);
  req.once('end', () => queueMicrotask(() => state.publicationRequests += 1));
`

const prematurePublication = S`
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const revision = JSON.parse(body);
    state.publicationRequests += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      sessionId: process.env.TAO_METRO_SESSION,
      revision: revision.revision,
      sequence: revision.sequence,
      status: 'published',
      publishedRevision: revision.revision,
    }));
  });
`

const sourceReadBarrier = S`
  Bundler.prototype.transformFile = async function(file, ...args) {
    if (state.armed && file.endsWith('/helper.ts')) {
      state.armed = false;
      state.before = await fs.promises.readFile(file, 'utf8');
      state.held = true;
      await new Promise(resolve => release = resolve);
      state.after = await fs.promises.readFile(file, 'utf8');
    }
    return await transform.call(this, file, ...args);
  };
`

const precommitFailure = S`
  const readFile = fs.promises.readFile;
  fs.promises.readFile = (file, ...args) => {
    if (state.fail && String(file).endsWith('/extra.ts')) {
      state.fail = false;
      return Promise.reject(new Error('Injected preprocessing failure'));
    }
    return readFile(file, ...args);
  };
`

const postcommitFailure = S`
  metro.getBundler().getBundler().getDependencyGraph().then(graph => {
    graph.getWatcher().prependOnceListener('change', () => { throw new Error('Injected postcommit failure'); });
    res.end('poison armed');
  });
`

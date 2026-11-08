import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';

// Tool dependencies can live outside the repository. No root configuration is changed.
const here = path.dirname(fileURLToPath(import.meta.url));
const tools = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../../../..');
const require = createRequire(path.join(tools, 'package.json'));
const { build } = require('esbuild');
const dist = path.join(here, 'dist');
await fs.mkdir(dist, { recursive: true });
const options = { bundle: true, minify: true, platform: 'browser', target: 'es2020', nodePaths: [path.join(tools, 'node_modules')], write: false, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' };
const result = await build({ ...options, stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Game from ${JSON.stringify(path.join(here, 'index.tsx'))}; function App(){const [open,setOpen]=React.useState(true);return open?React.createElement(Game,{onExit:()=>setOpen(false)}):React.createElement('div',{className:'desktop'},React.createElement('div',null,'✿'),React.createElement('h1',null,'PocketWorld'),React.createElement('p',null,'一颗星星，一场小小冒险。'),React.createElement('button',{onClick:()=>setOpen(true)},'打开团团守护者 ↗'));} createRoot(document.getElementById('game')).render(React.createElement(App));`, resolveDir: here, loader: 'tsx' }, outfile: path.join(dist, 'preview.js') });
const js = result.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = result.outputFiles.find(f => f.path.endsWith('.css')).text;
const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f1e5"><title>团团魔法录 · PocketWorld</title><style>html,body{margin:0;min-height:100%;background:#171526}body{font-family:"Microsoft YaHei",system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100svh;color:#d8c9aa;background:#171526}.shell{width:min(1100px,calc((100svh - 88px)*4/3),96vw);padding:22px 0}.caption{display:flex;justify-content:space-between;align-items:center;margin:0 3px 13px;font-size:11px;letter-spacing:.15em;color:#94869f}.caption strong{color:#b9aa8f;font-weight:600}.frame{border-radius:0;overflow:hidden;border:4px solid #756583;box-shadow:6px 6px 0 #101321}.foot{text-align:center;font-size:10px;letter-spacing:.12em;color:#8c7d99;margin-top:13px}.desktop{aspect-ratio:4/3;background:#262137;display:flex;flex-direction:column;align-items:center;justify-content:center}.desktop>div{font-size:60px;color:#98ad7c}.desktop h1{margin:12px}.desktop p{color:#96a086}.desktop button{border:0;background:#d59d76;color:#fff9e9;border-radius:13px;padding:16px 30px;cursor:pointer;font:inherit;margin-top:20px}@media(max-width:600px){.shell{width:98vw}.frame{border-width:3px;border-radius:13px}.caption{font-size:9px}.foot{font-size:9px}}${css}</style></head><body><main class="shell"><div class="caption"><strong>✿ POCKETWORLD / PLAYROOM</strong><span>一卷魔法书 · 五种命运</span></div><div class="frame" id="game"></div><div class="foot">团团魔法录 · THE WILDS OF SPELLS</div></main><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`;
const output = path.join(dist, '团团守护者.html'); await fs.writeFile(output, html);
await fs.writeFile(path.join(dist, 'index.html'), html);
const game = await build({ ...options, entryPoints: [path.join(here, 'index.tsx')], external: ['react', 'react-dom'], outfile: path.join(dist, 'game.js') });
for (const f of game.outputFiles) await fs.writeFile(f.path, f.contents);
const engine = await build({ ...options, platform: 'node', format: 'cjs', entryPoints: [path.join(here, 'engine.ts')], outfile: path.join(dist, 'engine.cjs') });
await fs.writeFile(engine.outputFiles[0].path, engine.outputFiles[0].contents);
console.log(JSON.stringify({ output, standaloneBytes: Buffer.byteLength(html), module: game.outputFiles.map(f => ({ file: path.basename(f.path), bytes: f.contents.length, gzip: gzipSync(f.contents).length })) }, null, 2));

const fs=require('node:fs'),path=require('node:path'),{buildSync}=require('esbuild');
const root=path.resolve(__dirname,'..'),server=path.join(root,'server');
for(const [entry,out] of [['typescript/lib/typescript.js','typescript.cjs'],['web-tree-sitter/tree-sitter.js','tree-sitter.cjs']])
  buildSync({entryPoints:[path.join(root,'node_modules',entry)],bundle:true,platform:'node',format:'cjs',minify:true,banner:{js:'// @generated: bundled offline parser assets; edit source adapters, not this file.'},outfile:path.join(server,out)});
fs.mkdirSync(path.join(server,'grammars'),{recursive:true});
fs.copyFileSync(path.join(root,'node_modules/web-tree-sitter/tree-sitter.wasm'),path.join(server,'grammars/tree-sitter.wasm'));
for(const language of ['python','java','c_sharp','go'])fs.copyFileSync(path.join(root,`node_modules/tree-sitter-wasms/out/tree-sitter-${language}.wasm`),path.join(server,`grammars/tree-sitter-${language}.wasm`));
for(const [from,to] of [['typescript/LICENSE.txt','typescript-LICENSE.txt'],['web-tree-sitter/LICENSE','tree-sitter-LICENSE.txt'],['tree-sitter-wasms/LICENSE','grammars/LICENSE.txt']])fs.copyFileSync(path.join(root,'node_modules',from),path.join(server,to));
buildSync({entryPoints:[path.join(server,'worker-entry.cjs')],bundle:true,platform:'node',format:'cjs',minify:true,banner:{js:'// @generated: bundled offline parser assets; edit source adapters, not this file.'},outfile:path.join(server,'analysis-worker.cjs')});

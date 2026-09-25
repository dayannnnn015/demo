import {describe,it,expect} from 'vitest';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

/**
 * Two contracts once held a literal NUL and DEL inside a regex instead of the
 * \u0000 and \u007f escapes. The pattern worked, but git and grep then treated
 * both files as binary, so every later change to them showed in review as
 * "Binary files differ" and was never read. Tabs, newlines and carriage
 * returns are the only control characters a source file may hold.
 */
describe('source files are plain text',()=>{
  it('contain no raw control characters',()=>{
    const found:string[]=[];
    const walk=(dir:string)=>{
      for(const name of readdirSync(dir)){
        const path=join(dir,name);
        if(statSync(path).isDirectory()){if(!['node_modules','fonts','brand','public'].includes(name))walk(path);continue;}
        if(!/\.(ts|tsx|sql|md|json|css|html)$/.test(name))continue;
        const text=readFileSync(path,'utf8');
        const at=text.search(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
        if(at>=0)found.push(`${path} at character ${at}`);
      }
    };
    for(const dir of ['src','web','database','scripts','docs','tests','supabase'])walk(dir);
    // The root holds the working contract and the release history, which are read as closely as code.
    for(const name of readdirSync('.'))if(!statSync(name).isDirectory()&&/\.(md|json|ts)$/.test(name)&&name!=='package-lock.json'){
      const at=readFileSync(name,'utf8').search(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
      if(at>=0)found.push(`${name} at character ${at}`);
    }
    expect(found).toEqual([]);
  });
});

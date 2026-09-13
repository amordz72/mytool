#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const shopDir=path.resolve(process.argv[2]||path.join(process.cwd(),'projects/mytool/source/shop'));
const files=fs.readdirSync(shopDir).filter(name=>name.endsWith('.html')).sort();
const errors=[];
for(const name of files){
  const source=fs.readFileSync(path.join(shopDir,name),'utf8');
  if(!/shop-common\.css\?v=\d+/.test(source))errors.push(name+': missing versioned shop-common.css');
  if(!/shop-routes\.js\?v=\d+/.test(source))errors.push(name+': missing versioned shop-routes.js');
  if(!/shop-shell\.js\?v=\d+/.test(source))errors.push(name+': missing versioned shop-shell.js');
  if(source.indexOf('shop-routes.js')>source.indexOf('shop-shell.js'))errors.push(name+': routes must load before shell');
  if(/<(header|nav)\b/i.test(source))errors.push(name+': page contains a manual header/nav');
  if(/class=["'][^"']*(sidebar|side-nav|shop-topbar|unified-nav)[^"']*["']/i.test(source))errors.push(name+': page contains copied shell markup');
}
if(errors.length){console.error('SHOP SHELL CHECK FAILED\n'+errors.map(x=>' - '+x).join('\n'));process.exit(1)}
console.log('SHOP SHELL CHECK PASS — '+files.length+' HTML pages use the shared shell.');

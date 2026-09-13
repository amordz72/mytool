#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const shopDir=path.resolve(process.argv[2]||path.join(process.cwd(),'projects/mytool/source/shop'));
const ownership={
  'sale.html':['branchCard','saleCard'],
  'purchase.html':['branchCard','purchaseCard'],
  'inventory-count.html':['branchCard','inventoryCard'],
  'stock.html':['branchCard','stockCard'],
  'transfers.html':['transferCard','transferListCard'],
};
for(const [file,allowed] of Object.entries(ownership)){
  const html=fs.readFileSync(path.join(shopDir,file),'utf8');
  for(const id of ['branchCard','saleCard','purchaseCard','inventoryCard','transferCard','stockCard','transferListCard']){
    if(!allowed.includes(id)&&html.includes(`id="${id}"`))throw new Error(`${file} contains foreign section ${id}`);
  }
}
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

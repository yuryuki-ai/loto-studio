import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
export const specs=[['5','mini',5,31],['6','loto6',6,43],['7','loto7',7,37],['n3','numbers3',3,9],['n4','numbers4',4,9]];
export function parseHistory(page,key,slug,k,limit,today){
 const rows=[];
 for(const row of page.match(/<tr>[\s\S]*?<\/tr>/g)||[]){
  const r=row.match(new RegExp('/'+slug+'/(\\d+)/')),d=row.match(/(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
  const n=row.match(key.startsWith('n')?/aria-label="当選番号 (\d+)"/:/aria-label="本数字 ([\d ]+)、/);
  if(!r||!d||!n)continue;
  const numbers=key.startsWith('n')?n[1].split('').map(Number):n[1].trim().split(/\s+/).map(Number);
  assert.equal(numbers.length,k,'Wrong digit/number count');
  assert(numbers.every(x=>Number.isInteger(x)&&x>=(key.startsWith('n')?0:1)&&x<=limit),'Out of range');
  if(!key.startsWith('n'))assert.equal(new Set(numbers).size,k,'Duplicate main number');
  const date=d[1]+'-'+d[2].padStart(2,'0')+'-'+d[3].padStart(2,'0');
  assert(date<=today,'Future draw');
  rows.push({round:Number(r[1]),date,numbers});
 }
 rows.sort((a,b)=>b.round-a.round);const latest=rows.slice(0,24);assert.equal(latest.length,24,'24 draws required');
 for(let i=1;i<24;i++){assert.equal(latest[i-1].round-latest[i].round,1,'Missing or duplicate round');assert(latest[i-1].date>latest[i].date,'Non-descending draw dates')}
 return latest;
}
export function guardRegression(rows,old){
 if(!old?.rows?.length)return;
 assert(rows[0].round>=old.rows[0].round,'Refusing older dataset');
 for(const row of rows){const existing=old.rows.find(r=>r.round===row.round);if(existing)assert.deepEqual(row,existing,'Conflicting result for known round '+row.round)}
}
export async function update(root,fixtureDir){
 const file=path.join(root,'index.html'),html=await fs.readFile(file,'utf8'),match=html.match(/const collectedHistory=([\s\S]*?);<\/script>/);
 assert(match,'Embedded data missing');const old=JSON.parse(match[1]),data={},checkedAt=new Date().toISOString();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(const [key,slug,k,limit] of specs){
  const url='https://kujishirube.info/'+slug+'/history/';
  let page;if(fixtureDir)page=await fs.readFile(path.join(fixtureDir,slug+'-latest.html'),'utf8');
  else{const res=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'LotoStudio/1.0 (public lottery history refresh)'}});assert(res.ok,'HTTP '+res.status+' for '+slug);page=await res.text()}
  const rows=parseHistory(page,key,slug,k,limit,today);guardRegression(rows,old[key]);
  data[key]={source:url,collectedAt:checkedAt,rows};console.log(key,rows[0].round,rows[0].date,rows[0].numbers.join(key.startsWith('n')?'':','));
 }
 const json=JSON.stringify(data),tag='<script id="history-data">const collectedHistory='+json+';</script>';
 const updated=html.replace(/<script id="history-data">[\s\S]*?<\/script>/,()=>tag);
 await fs.writeFile(file,updated);await fs.writeFile(path.join(root,'history.json'),json+'\n');
 for(const [key,slug] of specs)await fs.writeFile(path.join(root,(key==='5'?'miniloto':slug)+'-last24.csv'),data[key].rows.map(r=>r.numbers.join(key.startsWith('n')?'':',')).join('\n')+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')))await update(process.argv[2]||'.',process.argv[3]);
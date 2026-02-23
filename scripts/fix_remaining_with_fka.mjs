#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const db = JSON.parse(fs.readFileSync(path.join(root,'jersey-db.json'),'utf8'));
const imgsPath = path.join(root,'data','jersey-real-images.json');
const auditPath = path.join(root,'data','jersey-image-audit.json');
const imgs = JSON.parse(fs.readFileSync(imgsPath,'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath,'utf8'));
const imgMap = new Map(imgs.map(x=>[x.id,x]));

const failed = new Set(audit.failed_ids.map(x=>x.id));

const countryAlias = {
  'Korea Republic':'South Korea',
  'USA':'United States'
};

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function slug(s=''){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

async function fetchText(url, timeout=12000){
  const c = new AbortController();
  const t = setTimeout(()=>c.abort(), timeout);
  try {
    const r = await fetch(url,{headers:{'user-agent':'Mozilla/5.0'},signal:c.signal});
    if(!r.ok) return '';
    return await r.text();
  } catch { return ''; }
  finally { clearTimeout(t); }
}

async function ddgLinks(q){
  const html = await fetchText('https://duckduckgo.com/html/?q='+encodeURIComponent(q));
  if(!html) return [];
  const out = [...html.matchAll(/uddg=([^&"]+)/g)].map(m=>decodeURIComponent(m[1]).replace(/&amp;/g,'&'));
  return [...new Set(out)];
}

async function ogImage(page){
  const html = await fetchText(page);
  if(!html) return null;
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if(!m) return null;
  const img = m[1].trim();
  if(!/^https?:\/\//i.test(img)) return null;
  if (/(logo|badge|crest|escudo|icon|svg)/i.test(img)) return null;
  return img;
}

async function findFka(item){
  const team = countryAlias[item.entity] || item.entity;
  const type = item.type==='Away'?'away':'home';
  const y = Number(item.year);
  const queries = [
    `site:footballkitarchive.com ${team} ${y-1}-${String(y).slice(2)} ${type} kit`,
    `site:footballkitarchive.com ${team} ${y}-${String(y+1).slice(2)} ${type} kit`,
    `site:footballkitarchive.com ${team} ${y} ${type} kit`
  ];
  for (const q of queries){
    const links = (await ddgLinks(q)).filter(u=>/footballkitarchive\.com\/.+-(home|away)-kit\//i.test(u));
    for (const link of links.slice(0,6)){
      if (item.type==='Home' && /away-kit\//i.test(link)) continue;
      if (item.type==='Away' && /home-kit\//i.test(link)) continue;
      const img = await ogImage(link);
      if (img){
        return {image_url:img, source_url:link, source:'footballkitarchive.com', caption:'图片：球衣档案库（自动匹配）', image_quality:'jersey_product', confidence:0.92};
      }
      await sleep(80);
    }
  }
  return null;
}

let patched=0;
for (const item of db){
  if(!failed.has(item.id)) continue;
  const got = await findFka(item);
  if(!got) continue;
  imgMap.set(item.id,{id:item.id,...got});
  patched++;
  if (patched % 10 === 0) console.log('patched',patched);
}

fs.writeFileSync(imgsPath, JSON.stringify([...imgMap.values()], null, 2));
console.log('done patched=',patched);

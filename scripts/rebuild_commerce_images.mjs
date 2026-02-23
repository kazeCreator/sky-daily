#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dbPath = path.join(root, 'jersey-db.json');
const outPath = path.join(root, 'data', 'jersey-real-images.json');
const checkpointPath = path.join(root, 'data', 'commerce-progress.json');

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const BRAND_DOMAINS = {
  nike: ['www.nike.com'],
  adidas: ['www.adidas.com'],
  puma: ['us.puma.com','eu.puma.com','www.puma.com'],
  umbro: ['www.umbro.com'],
  reebok: ['www.reebok.com'],
  'new balance': ['www.newbalance.com']
};

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function withRetry(fn, attempts=3){
  let lastErr;
  for(let i=1;i<=attempts;i++){
    try { return await fn(); } catch(e){ lastErr=e; await sleep(300*i); }
  }
  throw lastErr;
}
function hostOf(u=''){ try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function brandDomains(brand=''){
  const b = String(brand).toLowerCase();
  for (const [k,v] of Object.entries(BRAND_DOMAINS)) if (b.includes(k)) return v;
  return ['www.nike.com','www.adidas.com','www.puma.com'];
}

async function fget(url, options={}, timeoutMs=12000){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function ddg(query){
  const url = 'https://duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const res = await fget(url, { headers: { 'user-agent':'Mozilla/5.0' }}, 12000);
  if (!res.ok) return [];
  const html = await res.text();
  const links = [...html.matchAll(/uddg=([^&"]+)/g)].map(m => decodeURIComponent(m[1]).replace(/&amp;/g,'&'));
  return [...new Set(links)];
}

async function getOgImage(pageUrl){
  try {
    const res = await fget(pageUrl, { headers: { 'user-agent':'Mozilla/5.0' }, redirect: 'follow' }, 12000);
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return null;
    const img = m[1].trim();
    if (!/^https:\/\//i.test(img)) return null;
    if (/(getty|shutterstock|alamy|imago|watermark)/i.test(img)) return null;
    return img;
  } catch { return null; }
}

async function findForItem(item){
  const type = item.type === 'Away' ? 'away' : 'home';
  const domains = brandDomains(item.brand);
  const queries = domains.map(d => `site:${d} ${item.entity} ${item.year} ${type} jersey`)
    .concat(domains.map(d => `site:${d} ${item.entity} ${type} football jersey`));

  for (const q of queries.slice(0,4)) {
    const links = await ddg(q);
    for (const link of links.slice(0,6)) {
      const h = hostOf(link);
      if (!domains.some(d => h === d || h.endsWith('.'+d.replace(/^www\./,'')))) continue;
      const og = await getOgImage(link);
      if (og) {
        return {
          id: item.id,
          image_url: og,
          caption: '图片：验证商城商品图',
          source_url: link,
          source: h,
          image_quality: 'jersey_product',
          confidence: 0.96
        };
      }
      await sleep(80);
    }
  }
  return null;
}

async function main(){
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(outPath,'utf8')); } catch {}
  const outMap = new Map(existing.map(x => [x.id, x]));

  let progress = { index: 0 };
  try { progress = JSON.parse(fs.readFileSync(checkpointPath,'utf8')); } catch {}

  const BATCH = 25;
  let i = progress.index || 0;
  let hit = outMap.size;

  for (; i < db.length; ) {
    const end = Math.min(i + BATCH, db.length);
    for (let j = i; j < end; j++) {
      const item = db[j];
      if (outMap.has(item.id)) continue;
      try {
        const got = await withRetry(() => findForItem(item), 3);
        if (got) { outMap.set(got.id, got); hit++; }
      } catch (e) {
        // keep going on per-item failure
      }
    }

    i = end;
    fs.writeFileSync(outPath, JSON.stringify([...outMap.values()], null, 2));
    fs.writeFileSync(checkpointPath, JSON.stringify({ index: i, total: db.length, matched: hit, updatedAt: new Date().toISOString() }, null, 2));
    console.log(`batch_done=${i}/${db.length}, matched=${hit}`);
  }

  fs.writeFileSync(outPath, JSON.stringify([...outMap.values()], null, 2));
  fs.writeFileSync(checkpointPath, JSON.stringify({ index: db.length, total: db.length, matched: hit, done: true, updatedAt: new Date().toISOString() }, null, 2));
  console.log(`done total=${db.length} matched=${hit}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });

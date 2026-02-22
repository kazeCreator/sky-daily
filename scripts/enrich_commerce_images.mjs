#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dbPath = path.join(root, 'jersey-db.json');
const imgPath = path.join(root, 'data', 'jersey-real-images.json');

const COMMERCE_DOMAINS = [
  'nike.com','adidas.com','puma.com','newbalance.com',
  'kitbag.com','fanatics.com','soccer.com','worldsoccershop.com',
  'classicfootballshirts.co.uk','store.fcbarcelona.com','shop.realmadrid.com'
];

const WATERMARK_HINTS = /(watermark|getty|apimages|shutterstock|alamy|imago|editorial)/i;

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const imgs = JSON.parse(fs.readFileSync(imgPath, 'utf8'));
const map = new Map(imgs.map(x => [x.id, x]));

function hostOf(u=''){ try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function isCommerceHost(host=''){ return COMMERCE_DOMAINS.some(d => host===d || host.endsWith('.'+d)); }
function isAllowedCommerceUrl(u=''){ const h=hostOf(u); return h && isCommerceHost(h); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function ddgSearch(query){
  const url = 'https://duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if(!res.ok) return [];
  const html = await res.text();
  const links = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)].map(m=>m[1]);
  const decoded = links.map(h => {
    try {
      const u = new URL(h, 'https://duckduckgo.com');
      const uddg = u.searchParams.get('uddg');
      return uddg ? decodeURIComponent(uddg) : h;
    } catch { return h; }
  });
  return decoded.filter(isAllowedCommerceUrl);
}

async function getOgImage(url){
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow' });
    if(!res.ok) return null;
    const finalUrl = res.url;
    if(!isAllowedCommerceUrl(finalUrl)) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if(!m) return null;
    const img = m[1].trim();
    if(!img || !/^https:\/\//i.test(img)) return null;
    if(!isAllowedCommerceUrl(img)) return null;
    if(WATERMARK_HINTS.test(img)) return null;

    const head = await fetch(img, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
    const ctype = String(head.headers.get('content-type') || '').toLowerCase();
    if(!ctype.startsWith('image/')) return null;
    return img;
  } catch { return null; }
}

async function findCommerceImage(item){
  const qBase = `${item.entity} ${item.year} ${item.type==='Home'?'home':'away'} jersey`;
  const queries = [
    `${qBase} store`,
    `${item.entity} ${item.type==='Home'?'home':'away'} shirt buy`,
    `${item.entity} ${item.year} football shirt`
  ];

  for(const q of queries){
    const candidates = await ddgSearch(q);
    for(const link of candidates.slice(0,5)){
      const og = await getOgImage(link);
      if(og){
        return {
          image_url: og,
          source_url: link,
          source: hostOf(link),
          caption: '图片：验证商城商品图',
          image_quality: 'jersey_product',
          confidence: 0.95
        };
      }
      await sleep(120);
    }
  }
  return null;
}

function needsReplacement(rec){
  if(!rec) return true;
  const h = hostOf(rec.source_url || rec.image_url || '');
  return !isCommerceHost(h);
}

async function main(){
  let targets = 0, replaced = 0, untouched = 0;
  for(const item of db){
    const cur = map.get(item.id);
    if(!needsReplacement(cur)){ untouched++; continue; }
    targets++;
    const got = await findCommerceImage(item);
    if(got){
      map.set(item.id, { id: item.id, ...got });
      replaced++;
    }
  }

  const out = [...map.values()];
  fs.writeFileSync(imgPath, JSON.stringify(out, null, 2));
  console.log(`targets=${targets} replaced=${replaced} untouched=${untouched} total=${out.length}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });

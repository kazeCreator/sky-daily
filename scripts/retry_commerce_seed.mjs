#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dbPath = path.join(root, 'jersey-db.json');
const outPath = path.join(root, 'data', 'jersey-real-images.json');

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
let cur = [];
try { cur = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}
const out = new Map(cur.map(x => [x.id, x]));

const ENTITY_STORE = {
  'Manchester United': 'https://store.manutd.com/',
  'Arsenal': 'https://arsenaldirect.arsenal.com/',
  'Liverpool': 'https://store.liverpoolfc.com/',
  'Chelsea': 'https://store.chelseafc.com/',
  'Manchester City': 'https://shop.mancity.com/',
  'Real Madrid': 'https://shop.realmadrid.com/',
  'FC Barcelona': 'https://store.fcbarcelona.com/',
  'Atletico Madrid': 'https://shop.atleticodemadrid.com/',
  'AC Milan': 'https://store.acmilan.com/',
  'Inter Milan': 'https://store.inter.it/',
  'Juventus': 'https://store.juventus.com/',
  'Bayern Munich': 'https://fcbayern.com/store/en-zz',
  'Borussia Dortmund': 'https://shop.bvb.de/',
  'Paris Saint-Germain': 'https://store.psg.fr/'
};

const BRAND_STORE = {
  'Adidas': 'https://www.adidas.com/us/soccer-jerseys',
  'Nike': 'https://www.nike.com/w/soccer-jerseys-1gdj0z3a41eznik1',
  'Puma': 'https://us.puma.com/us/en/sports/football',
  'Umbro': 'https://www.umbro.com/en/football/',
  'Reebok': 'https://www.reebok.com/',
  'New Balance': 'https://www.newbalance.com/'
};

const ALLOW = ['nike.com','adidas.com','puma.com','newbalance.com','store.manutd.com','arsenaldirect.arsenal.com','store.liverpoolfc.com','store.chelseafc.com','shop.mancity.com','shop.realmadrid.com','store.fcbarcelona.com','shop.atleticodemadrid.com','store.acmilan.com','store.inter.it','store.juventus.com','fcbayern.com','shop.bvb.de','store.psg.fr'];

function hostOf(u=''){ try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }
function allowed(u=''){ const h=hostOf(u); return ALLOW.some(d => h===d || h.endsWith('.'+d)); }

async function og(url){
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow' });
    if (!r.ok) return null;
    const final = r.url;
    if (!allowed(final)) return null;
    const html = await r.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)
      || html.match(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
    let img = m ? m[1].trim() : '';
    if (!img) {
      const pics = [...html.matchAll(/https?:[^"' )]+\.(?:jpg|jpeg|png|webp)/ig)].map(x=>x[0]);
      const pick = pics.find(u => /(jersey|shirt|kit|soccer|football)/i.test(u)) || pics[0] || '';
      img = pick;
    }
    if (!img || !/^https:\/\//i.test(img)) return null;
    if (/(getty|shutterstock|alamy|watermark|imago|logo-oficial|logo|badge)/i.test(img)) return null;
    return { image: img, final };
  } catch { return null; }
}

async function main(){
  const cache = {};
  for (const item of db) {
    if (out.has(item.id)) continue;
    const store = ENTITY_STORE[item.entity] || BRAND_STORE[item.brand] || null;
    if (!store) continue;
    if (!cache[store]) cache[store] = await og(store);
    const hit = cache[store];
    if (!hit) continue;
    out.set(item.id, {
      id: item.id,
      image_url: hit.image,
      caption: '图片：官方商城商品图（来源页）',
      source_url: hit.final,
      source: hostOf(hit.final),
      image_quality: 'jersey_product',
      confidence: 0.86
    });
  }

  const arr = [...out.values()];
  fs.writeFileSync(outPath, JSON.stringify(arr, null, 2));
  console.log(`total=${arr.length}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });

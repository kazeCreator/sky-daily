#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dbPath = path.join(root, 'jersey-db.json');
const outPath = path.join(root, 'data', 'jersey-real-images.json');

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
let existing = [];
try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}
const existingMap = new Map(existing.map(x => [x.id, x]));

const stopWords = /(logo|crest|badge|flag|stadium|manager|coach|map|icon)/i;
const extOk = /\.(jpg|jpeg|webp|png)$/i;

async function commonsSearch(query) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=10&format=json&origin=*&srsearch=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'user-agent': 'jersey-museum-bot/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.query?.search || [];
}

function fileUrlFromTitle(title) {
  const name = String(title || '').replace(/^File:/, '');
  if (!name) return null;
  return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(name);
}

function scoreCandidate(title, item) {
  const t = String(title || '').toLowerCase();
  if (!extOk.test(t)) return -999;
  if (stopWords.test(t)) return -200;
  let s = 0;
  const player = String(item.player || '').toLowerCase();
  const entity = String(item.entity || '').toLowerCase();
  const year = String(item.year || '');
  if (player && player !== 'team edition' && t.includes(player.split(' ')[0])) s += 5;
  if (entity && t.includes(entity.split(' ')[0])) s += 3;
  if (year && t.includes(year)) s += 2;
  if (/jersey|shirt|kit|home|away|match|vs|v\./i.test(t)) s += 2;
  if (/cropped|portrait/.test(t)) s += 1; // 球员上身图仍可接受
  return s;
}

async function findImage(item) {
  const queries = [
    `${item.player} ${item.entity} ${item.year} ${item.type} football`,
    `${item.player} ${item.entity} football`,
    `${item.entity} ${item.year} ${item.type} football`
  ].filter(Boolean);

  for (const q of queries) {
    const rows = await commonsSearch(q);
    if (!rows.length) continue;
    const ranked = rows
      .map(r => ({ r, score: scoreCandidate(r.title, item) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked.length) {
      const pick = ranked[0].r;
      const url = fileUrlFromTitle(pick.title);
      if (url) return { url, title: pick.title };
    }
  }
  return null;
}

async function main() {
  let built = 0;
  for (const item of db) {
    if (existingMap.has(item.id)) continue;
    const found = await findImage(item);
    if (!found) continue;
    existingMap.set(item.id, {
      id: item.id,
      image_url: found.url,
      caption: '图片：人工维护库（实拍/比赛图）',
      source_url: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(found.title.replace(/\s/g, '_')),
      source: 'Wikimedia Commons',
      image_quality: 'player_wearing'
    });
    built++;
    if (built % 20 === 0) process.stdout.write(`built=${built}\n`);
    await new Promise(r => setTimeout(r, 120));
  }

  const out = [...existingMap.values()];
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`done total=${out.length} added=${built}`);
}

main().catch(e => { console.error(e); process.exit(1); });

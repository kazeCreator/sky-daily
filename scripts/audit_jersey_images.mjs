#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dbPath = path.join(root, 'jersey-db.json');
const imgPath = path.join(root, 'data', 'jersey-real-images.json');
const reportPath = path.join(root, 'data', 'jersey-image-audit.json');

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const imgs = JSON.parse(fs.readFileSync(imgPath, 'utf8'));
const map = new Map(imgs.map(x => [x.id, x]));

const BAD_HINTS = /(logo|badge|crest|escudo|icon|shield|emblem|svg)/i;
const JERSEY_HINTS = /(jersey|shirt|kit|football|soccer|home|away|player|match|retro|season|主场|客场|球衣)/i;

function check(item, rec){
  if (!rec || !rec.image_url) return { ok:false, reason:'missing_image' };
  const blob = `${rec.image_url} ${rec.caption||''} ${rec.source_url||''}`;
  if (BAD_HINTS.test(blob)) return { ok:false, reason:'logo_or_badge_like' };
  if (!JERSEY_HINTS.test(blob)) return { ok:false, reason:'not_jersey_like' };

  const b = blob.toLowerCase();
  if (item.type === 'Home' && /away\b/.test(b) && !/home\b/.test(b)) return { ok:false, reason:'type_mismatch_home_vs_away' };
  if (item.type === 'Away' && /home\b/.test(b) && !/away\b/.test(b)) return { ok:false, reason:'type_mismatch_away_vs_home' };

  return { ok:true, reason:'pass' };
}

const report = { total: db.length, pass: 0, fail: 0, reasons: {}, failed_ids: [] };
let patched = 0;
for (const item of db) {
  const rec = map.get(item.id);
  const r = check(item, rec);
  if (r.ok) {
    report.pass++;
    continue;
  }
  report.fail++;
  report.reasons[r.reason] = (report.reasons[r.reason] || 0) + 1;
  report.failed_ids.push({ id:item.id, reason:r.reason, entity:item.entity, year:item.year, type:item.type });

  if (rec) {
    const confidence = Number(rec.confidence || 0);
    if (confidence >= 0.8 || !rec.caption?.includes('待人工校对')) {
      rec.confidence = 0.35;
      rec.caption = `图片：待人工校对（${r.reason}）`;
      patched++;
    }
  }
}

fs.writeFileSync(imgPath, JSON.stringify(imgs, null, 2));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, patched }, null, 2));

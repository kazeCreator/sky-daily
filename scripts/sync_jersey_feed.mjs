#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const root = process.cwd();
const FEED_PATH = path.join(root, 'jersey-feed.json');
const DB_PATH = path.join(root, 'jersey-db.json');
const SOURCES_PATH = path.join(root, 'data', 'jersey-sources.json');

const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));

const TEAM_ALIASES = {
  'manchester united': { category: 'club', entity: 'Manchester United', league: 'Premier League' },
  'man utd': { category: 'club', entity: 'Manchester United', league: 'Premier League' },
  'arsenal': { category: 'club', entity: 'Arsenal', league: 'Premier League' },
  'liverpool': { category: 'club', entity: 'Liverpool', league: 'Premier League' },
  'chelsea': { category: 'club', entity: 'Chelsea', league: 'Premier League' },
  'manchester city': { category: 'club', entity: 'Manchester City', league: 'Premier League' },
  'real madrid': { category: 'club', entity: 'Real Madrid', league: 'La Liga' },
  'barcelona': { category: 'club', entity: 'FC Barcelona', league: 'La Liga' },
  'atletico': { category: 'club', entity: 'Atletico Madrid', league: 'La Liga' },
  'bayern': { category: 'club', entity: 'Bayern Munich', league: 'Bundesliga' },
  'dortmund': { category: 'club', entity: 'Borussia Dortmund', league: 'Bundesliga' },
  'juventus': { category: 'club', entity: 'Juventus', league: 'Serie A' },
  'ac milan': { category: 'club', entity: 'AC Milan', league: 'Serie A' },
  'inter': { category: 'club', entity: 'Inter Milan', league: 'Serie A' },
  'psg': { category: 'club', entity: 'Paris Saint-Germain', league: 'Ligue 1' },
  'paris saint-germain': { category: 'club', entity: 'Paris Saint-Germain', league: 'Ligue 1' },
  'argentina': { category: 'country', entity: 'Argentina', league: 'National Team' },
  'brazil': { category: 'country', entity: 'Brazil', league: 'National Team' },
  'france': { category: 'country', entity: 'France', league: 'National Team' },
  'germany': { category: 'country', entity: 'Germany', league: 'National Team' },
  'spain': { category: 'country', entity: 'Spain', league: 'National Team' },
  'england': { category: 'country', entity: 'England', league: 'National Team' },
  'portugal': { category: 'country', entity: 'Portugal', league: 'National Team' },
  'netherlands': { category: 'country', entity: 'Netherlands', league: 'National Team' }
};

const KIT_KEYWORDS = ['kit', 'jersey', 'shirt', 'home kit', 'away kit', 'third kit', '球衣', '主场', '客场'];

function strip(s = '') { return s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function era(y){ if(y<2000)return '90s'; if(y<2010)return '00s'; if(y<2020)return '10s'; return '20s'; }

function parseItems(xml) {
  const block = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return block.map(item => {
    const read = tag => strip((item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')) || [,''])[1]);
    return { title: read('title'), link: read('link'), pubDate: read('pubDate'), description: read('description') };
  });
}

function inferEntity(text) {
  const t = text.toLowerCase();
  for (const [k, v] of Object.entries(TEAM_ALIASES)) {
    if (t.includes(k)) return v;
  }
  return { category: 'club', entity: 'Unknown Club', league: 'Unknown League' };
}

function credibilityFor(url, base = 80){
  const u = url.toLowerCase();
  if (u.includes('fifa.com') || u.includes('uefa.com')) return 92;
  if (u.includes('manutd.com') || u.includes('arsenal.com') || u.includes('liverpoolfc.com') || u.includes('realmadrid.com') || u.includes('fcbarcelona.com')) return 93;
  if (u.includes('footyheadlines.com')) return 82;
  return base;
}

async function fetchSource(src) {
  const res = await fetch(src.url, { headers: { 'user-agent': 'jersey-sync-bot/1.0' } });
  if (!res.ok) throw new Error(`${src.name} ${res.status}`);
  const xml = await res.text();
  return parseItems(xml).map(i => ({ ...i, source: src.name, source_url: src.site }));
}

function mapToRecord(item) {
  const combo = `${item.title} ${item.description}`;
  const matched = KIT_KEYWORDS.some(k => combo.toLowerCase().includes(k));
  if (!matched) return null;

  const info = inferEntity(combo);
  const year = Number((item.pubDate.match(/\b(20\d{2})\b/) || [new Date().getFullYear()])[0]);
  const type = /away/i.test(combo) ? 'Away' : /third/i.test(combo) ? 'Third' : 'Home';

  const idHash = crypto.createHash('md5').update(item.link).digest('hex').slice(0, 10);
  return {
    id: `live-${idHash}`,
    category: info.category,
    entity: info.entity,
    sport: 'Football',
    league: info.league,
    team: info.category === 'club' ? info.entity : null,
    country: info.category === 'country' ? info.entity : null,
    player: 'Team Edition',
    year,
    era: era(year),
    number: '-',
    brand: 'Unknown',
    type,
    colorway: 'TBD',
    image_url: `https://placehold.co/640x800/f2f2f2/1f1f1f.png?text=${encodeURIComponent(info.entity + ' ' + year + ' ' + type + ' Kit')}`,
    design_background: item.title,
    cultural_notes: strip(item.description).slice(0, 180),
    source: item.source,
    source_url: item.link || item.source_url,
    source_type: 'media',
    credibility: credibilityFor(item.link || item.source_url, 80),
    last_verified: new Date().toISOString().slice(0,10)
  };
}

function dedup(items){
  const m = new Map();
  for(const it of items){
    const key = `${it.category}|${it.entity}|${it.year}|${it.type}|${it.design_background}`.toLowerCase();
    const old = m.get(key);
    if(!old || (it.credibility||0) > (old.credibility||0)) m.set(key,it);
  }
  return [...m.values()];
}

function mergeDb(db, feed){
  const m = new Map(db.map(i => [`${i.category}|${i.entity}|${i.player}|${i.year}|${i.type}`.toLowerCase(), i]));
  for(const it of feed){
    const k = `${it.category}|${it.entity}|${it.player}|${it.year}|${it.type}`.toLowerCase();
    const old = m.get(k);
    if(!old || (it.credibility||0) > (old.credibility||0)) m.set(k, { ...old, ...it });
  }
  return [...m.values()];
}

async function main(){
  let all = [];
  for(const src of sources){
    try {
      const rows = await fetchSource(src);
      all.push(...rows);
    } catch (e) {
      console.error('source failed:', src.name, e.message);
    }
  }

  const mapped = dedup(all.map(mapToRecord).filter(Boolean)).slice(0, 120);
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const merged = mergeDb(db, mapped);

  fs.writeFileSync(FEED_PATH, JSON.stringify(mapped, null, 2));
  fs.writeFileSync(DB_PATH, JSON.stringify(merged, null, 2));
  console.log(`feed=${mapped.length}, db=${merged.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });

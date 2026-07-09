// 深淵の書 — 生成ロジック検証テスト
// 実行: node test/logic.test.mjs   （npm不要・素のNodeで動く）
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('script tag not found'); process.exit(1); }

// --- DOMモック ---
const mockValues = { 'sel-sex': 'random', 'sel-job': 'random', 'inp-age': '' };
const stubEl = id => ({
  value: mockValues[id] ?? '',
  style: {}, textContent: '', innerHTML: '',
  classList: { add() {}, remove() {} },
  appendChild() {}, addEventListener() {},
});
globalThis.document = {
  getElementById: id => stubEl(id),
  createElement: () => stubEl(''),
  addEventListener() {},
  body: { appendChild() {}, removeChild() {} },
};

// グローバルスコープで評価し、テスト対象を掴む
(0, eval)(m[1] + '\n;globalThis.__t={generate,toCoco,toText,makeStory,db,distrib,OCC,BASE,CATS,STORY};');
const t = globalThis.__t;

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL: ' + name); } };

// --- 1. ランダム生成 1000回：範囲・派生値・6版ルール ---
for (let i = 0; i < 1000; i++) {
  mockValues['inp-age'] = '';
  mockValues['sel-job'] = 'random';
  const c = t.generate();
  const s = c.stats, d = c.derived;
  check('STR 3-18', s.STR >= 3 && s.STR <= 18);
  check('CON 3-18', s.CON >= 3 && s.CON <= 18);
  check('POW 3-18', s.POW >= 3 && s.POW <= 18);
  check('DEX 3-18', s.DEX >= 3 && s.DEX <= 18);
  check('APP 3-18', s.APP >= 3 && s.APP <= 18);
  check('SIZ 8-18', s.SIZ >= 8 && s.SIZ <= 18);
  check('INT 8-18', s.INT >= 8 && s.INT <= 18);
  check('EDU 6-18', s.EDU >= 6 && s.EDU <= 18);
  check('age >= EDU+6 (6e rule)', c.age >= s.EDU + 6);
  check('age <= 80', c.age <= 80);
  check('HP=(CON+SIZ)/2 floor', d.HP === Math.floor((s.CON + s.SIZ) / 2));
  check('MP=POW', d.MP === s.POW);
  check('SAN=POW*5', d.SAN === s.POW * 5);
  check('Luck=POW*5', d.Luck === s.POW * 5);
  check('Idea=INT*5', d.Idea === s.INT * 5);
  check('Know=EDU*5', d.Know === s.EDU * 5);
  check('回避 >= DEX*2 (趣味Pで上乗せ可)', c.skills['回避'] >= s.DEX * 2);
  check('母国語=EDU*5', c.skills['母国語'] === s.EDU * 5);
  for (const [k, v] of Object.entries(c.skills)) {
    const cap = k === '信用' ? 99 : 90;
    check(`skill ${k} <= ${cap}`, v <= cap);
    check(`skill ${k} >= 0`, v >= 0);
  }
}

// --- 2. 年齢指定時：EDUがage-6にクランプされる ---
for (const ageStr of ['14', '20', '80']) {
  for (let i = 0; i < 200; i++) {
    mockValues['inp-age'] = ageStr;
    const c = t.generate();
    check(`age=${ageStr}: EDU <= age-6`, c.stats.EDU <= c.age - 6);
    check(`age=${ageStr}: age respected`, c.age === parseInt(ageStr));
    check(`age=${ageStr}: Know follows clamped EDU`, c.derived.Know === c.stats.EDU * 5);
  }
}
mockValues['inp-age'] = '';

// --- 3. ダメージボーナス境界値 ---
check('db 12 = -1d6', t.db(6, 6) === '-1d6');
check('db 13 = -1d4', t.db(7, 6) === '-1d4');
check('db 16 = -1d4', t.db(8, 8) === '-1d4');
check('db 17 = 0',    t.db(9, 8) === '0');
check('db 24 = 0',    t.db(12, 12) === '0');
check('db 25 = +1d4', t.db(13, 12) === '+1d4');
check('db 32 = +1d4', t.db(16, 16) === '+1d4');
check('db 33 = +1d6', t.db(17, 16) === '+1d6');
check('db 40 = +1d6', t.db(20, 20) === '+1d6');
check('db 41 = +2d6', t.db(21, 20) === '+2d6');

// --- 4. ココフォリア駒JSON ---
for (let i = 0; i < 100; i++) {
  const c = t.generate();
  let json;
  try { json = JSON.parse(t.toCoco(c)); } catch { check('toCoco parses', false); continue; }
  check('kind=character', json.kind === 'character');
  check('status: HP/MP/SAN integers', json.data.status.length === 3 &&
    json.data.status.every(s => Number.isInteger(s.value) && Number.isInteger(s.max) && typeof s.label === 'string'));
  check('params: 8 stats as strings', json.data.params.length === 8 &&
    json.data.params.every(p => typeof p.value === 'string'));
  check('size/width/height = 3', json.data.size === 3 && json.data.width === 3 && json.data.height === 3);
  check('initiative = DEX', json.data.initiative === c.stats.DEX);
  check('cmd: SAN roll', json.data.commands.includes('1d100<={SAN} 【正気度ロール】'));
  check('cmd: こぶしダメージ', json.data.commands.includes('【ダメージ：こぶし】'));
  check('cmd: キックダメージ', json.data.commands.includes('【ダメージ：キック】'));
  check('cmd: DB suffix wellformed', /1d3(\+0|[+-]\d+d\d+) 【ダメージ：こぶし】/.test(json.data.commands));
  check('cmd: no undefined/NaN', !/undefined|NaN/.test(json.data.commands));
}

// --- 5. 全職業：生成・ストーリー・テキスト出力 ---
for (const o of t.OCC) {
  mockValues['sel-job'] = o.name;
  const c = t.generate();
  check(`occ ${o.name}: matches`, c.occupation === o.name);
  check(`occ ${o.name}: story generated`, typeof c.story === 'string' && c.story.length > 40);
  check(`occ ${o.name}: story no undefined`, !c.story.includes('undefined'));
  check(`occ ${o.name}: credit in range`, c.skills['信用'] >= o.cr[0] && c.skills['信用'] <= o.cr[1]);
  const txt = t.toText(c);
  check(`occ ${o.name}: text has story`, txt.includes(c.story));
  check(`occ ${o.name}: text has name`, txt.includes(c.name));
}

// --- 6. ストーリーのバリエーション数（増強の確認） ---
check('birth >= 24', t.STORY.birth.length >= 24);
check('origin >= 14', t.STORY.origin.length >= 14);
check('end >= 14', t.STORY.end.length >= 14);
check('all 17 occupations have 3 paths', Object.values(t.STORY.path).every(p => p.length >= 3));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

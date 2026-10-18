// 深淵の書 — 生成ロジック検証テスト
// 実行: node test/logic.test.mjs   （npm不要・素のNodeで動く）
import { readFileSync } from 'fs';

// TARGET_HTML 環境変数で別ファイルを検証できる（例: 7版ブランチの回帰確認）
const target = process.env.TARGET_HTML ?? new URL('../index.html', import.meta.url);
const html = readFileSync(target, 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('script tag not found'); process.exit(1); }

// --- DOMモック ---
const mockValues = { 'sel-sex': 'random', 'sel-job': 'random', 'inp-age': '', 'sel-era': '現代', 'inp-cap': '', 'inp-rectarget': '' };
let mockRecommended = []; // 「チェック済みの推奨技能」を差し替えてテストする
const stubEl = id => ({
  value: mockValues[id] ?? '',
  style: {}, textContent: '', innerHTML: '',
  classList: { add() {}, remove() {} },
  appendChild() {}, addEventListener() {},
});
globalThis.document = {
  getElementById: id => stubEl(id),
  createElement: () => stubEl(''),
  querySelectorAll: sel => sel.includes('checkbox') ? mockRecommended.map(s => ({ dataset: { skill: s } })) : [],
  addEventListener() {},
  body: { appendChild() {}, removeChild() {} },
};

// グローバルスコープで評価し、テスト対象を掴む
(0, eval)(m[1] + '\n;globalThis.__t={generate,toCoco,toText,makeStory,db,distrib,OCC,BASE,CATS,STORY,ERAS};');
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

// --- 2b. 技能上限（cap）：信用以外の全技能が cap 以下 ---
for (const cap of ['70', '80', '99']) {
  for (let i = 0; i < 300; i++) {
    mockValues['inp-cap'] = cap;
    mockValues['sel-job'] = 'random';
    const c = t.generate();
    check(`cap=${cap}: 全技能<=cap（信用除く）`,
      Object.entries(c.skills).every(([k, v]) => k === '信用' || v <= +cap));
    check(`cap=${cap}: 母国語=min(EDU*5,cap)`, c.skills['母国語'] === Math.min(c.stats.EDU * 5, +cap));
  }
}
mockValues['inp-cap'] = '';

// --- 2c. 時代は「現代」で固定（2026-10-18に選択欄を外した）・年齢層・方向性・表示欄 ---
check('ERAS: 現代あり（データは残す）', '現代' in t.ERAS);
for (let i = 0; i < 100; i++) {
  const c = t.generate();
  check('時代は現代＝コンピューターがある', 'コンピューター' in c.skills);
}
const BANDS = { '子供': [10, 14], '学生': [15, 22], '社会人': [22, 60], 'シニア': [60, 80] };
for (const ed of ['6', '7']) {
  mockValues['sel-edition'] = ed;
  for (const [band, [lo, hi]] of Object.entries(BANDS)) {
    mockValues['sel-ageband'] = band;
    for (let i = 0; i < 200; i++) {
      const c = t.generate();
      check(`${ed}版 年齢層 ${band}: ${lo}〜${hi}`, c.age >= lo && c.age <= hi);
      if (ed === '6') check(`6版 年齢層 ${band}: EDU <= 年齢-6`, c.stats.EDU <= Math.max(1, c.age - 6));
    }
  }
  mockValues['inp-age'] = '30';
  mockValues['sel-ageband'] = '子供';
  check(`${ed}版 直接入力が年齢層より優先`, t.generate().age === 30);
  mockValues['inp-age'] = '';
}
mockValues['sel-ageband'] = '';
mockValues['sel-edition'] = '6';
// 方向性：その役回りの技能の平均が、おまかせより高くなる
const avgOf = (role, keys, n = 400) => {
  mockValues['sel-role'] = role;
  let sum = 0;
  for (let i = 0; i < n; i++) { const c = t.generate(); sum += keys.reduce((a, k) => a + c.skills[k], 0) / keys.length; }
  return sum / n;
};
const ATK = ['こぶし', 'キック', '組み付き', '刃物', '拳銃', 'ライフル', 'ショットガン', '回避', '投擲'];
const EXP = ['目星', '聞き耳', '図書館', '忍び歩き', '隠れる', '追跡', '写真術', 'ナビゲート'];
check('方向性 アタッカー：戦闘技能が伸びる', avgOf('アタッカー', ATK) > avgOf('おまかせ', ATK) + 3);
check('方向性 探索役：探索技能が伸びる', avgOf('探索役', EXP) > avgOf('おまかせ', EXP) + 3);
mockValues['sel-role'] = 'アタッカー';
check('方向性がCHARに載る', t.generate().role === 'アタッカー');
mockValues['sel-role'] = '';
check('おまかせなら方向性は空', t.generate().role === '');
// 表示欄：背景を外したらテキストにも出ない
{
  const c = t.generate();
  check('既定は背景あり', t.toText(c).includes(c.story));
  c.show = { ...c.show, story: false };
  check('背景を外すとテキストに出ない', !t.toText(c).includes(c.story) && !t.toText(c).includes('--- 背景設定 ---'));
}

// --- 2c2. 推奨技能：目標値まで必ず確保され、上限も超えない ---
for (const target of ['50', '75']) {
  for (const cap of ['80', '99']) {
    for (let i = 0; i < 150; i++) {
      mockValues['inp-rectarget'] = target;
      mockValues['inp-cap'] = cap;
      mockValues['sel-job'] = 'random';
      mockRecommended = ['考古学', 'ライフル', '目星', 'オカルト'];
      const c = t.generate();
      const want = Math.min(+target, +cap);
      for (const r of mockRecommended) {
        check(`推奨 ${r} >= 目標(${want})`, c.skills[r] >= want);
        check(`推奨 ${r} <= 上限(${cap})`, c.skills[r] <= +cap);
      }
      check('推奨技能がCHARに載る', c.recommended.length === 4 && c.recTarget === Math.min(+target, +cap));
    }
  }
}
mockRecommended = [];
mockValues['inp-rectarget'] = '';
mockValues['inp-cap'] = '';


// --- 2d. 職業ポイントは全職業プラス ---
for (const o of t.OCC) {
  const s = { STR: 10, CON: 10, POW: 10, DEX: 10, APP: 10, SIZ: 12, INT: 12, EDU: 12 };
  check(`occ ${o.name}: ptsが正の整数`, Number.isInteger(o.pts(s)) && o.pts(s) > 0);
}

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

// --- 7. 7版モード：能力値×5・派生値・上限・出力 ---
mockValues['sel-edition'] = '7';
mockValues['sel-job'] = 'random';
mockValues['inp-cap'] = '';
mockRecommended = [];
for (let i = 0; i < 1000; i++) {
  mockValues['inp-age'] = '';
  const c = t.generate();
  const s = c.stats, d = c.derived;
  check('7e: edition', c.edition === '7');
  for (const k of ['STR', 'CON', 'POW', 'DEX', 'APP']) check(`7e: ${k} 15-90 ×5`, s[k] >= 15 && s[k] <= 90 && s[k] % 5 === 0);
  for (const k of ['SIZ', 'INT', 'EDU']) check(`7e: ${k} 40-90 ×5`, s[k] >= 40 && s[k] <= 90 && s[k] % 5 === 0);
  check('7e: HP=(CON+SIZ)/10', d.HP === Math.floor((s.CON + s.SIZ) / 10));
  check('7e: MP=POW/5', d.MP === Math.floor(s.POW / 5));
  check('7e: SAN=POW', d.SAN === s.POW);
  check('7e: Luck 15-90 ×5', d.Luck >= 15 && d.Luck <= 90 && d.Luck % 5 === 0);
  check('7e: MOV 2-9', d.MOV >= 2 && d.MOV <= 9);
  check('7e: no Idea/Know', d.Idea === undefined && d.Know === undefined);
  check('7e: 母国語=EDU', c.skills['母国語'] === s.EDU);
  check('7e: default cap 75', c.cap === 75);
  for (const [k, v] of Object.entries(c.skills)) {
    if (k !== '信用' && k !== '母国語') check(`7e: ${k} <= 75`, v <= 75);
  }
}
// 7版：推奨技能
mockRecommended = ['目星', 'オカルト'];
for (let i = 0; i < 200; i++) {
  const c = t.generate();
  check('7e reco: 目星 >= 60', c.skills['目星'] >= 60);
  check('7e reco: オカルト >= 60', c.skills['オカルト'] >= 60);
  const json = JSON.parse(t.toCoco(c));
  check('7e coco: no ×5 on stats', !json.data.commands.includes('{STR}*5'));
  check('7e coco: no アイデア', !json.data.commands.includes('【アイデア】'));
  check('7e coco: has MOV param', json.data.params.some(p => p.label === 'MOV'));
  check('7e coco: no undefined/NaN', !/undefined|NaN/.test(json.data.commands));
  const txt = t.toText(c);
  check('7e text: 7版', txt.includes('7版'));
  check('7e text: no undefined/NaN', !/undefined|NaN/.test(txt));
}
mockRecommended = [];
mockValues['sel-edition'] = '6';
check('6e after 7e: edition back', t.generate().edition === '6');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

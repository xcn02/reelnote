// Test de bout en bout de la page dans jsdom : réseau et audio simulés, aucun appel réel.
const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict');
const http = require('http'); const fs = require('fs'); const pth = require('path');

const ROOT = pth.join(__dirname, '..', 'www');
const server = http.createServer((req, res) => {
  const f = pth.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(d); });
});
let BASE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resp = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

const EMBED = '<blockquote><div><a href="x">View</a><p><a href="x">A post shared by Chef Léa (@chef.lea)</a></p></div></blockquote>';
const PAGE_OK = '<html><head><meta property="og:title" content="Chef Léa (@chef.lea) on Instagram: &quot;Poulet citron&quot;"><meta property="og:description" content="1,234 likes - chef.lea on March 3, 2025: &quot;Poulet citron en 15 min avec du riz&quot;."></head></html>';
const PAGE_WALL = '<html><head><meta property="og:title" content="Instagram"><meta property="og:description" content="Create an account or log in to Instagram - Share what you\'re into with the people who get you."></head></html>';
const blank = (id, url, extra = {}) => Object.assign({ id, url, createdAt: 1, status: 'partial', title: '', summary: '', points: [], category: '', tags: [], fav: false, note: '', caption: '', shared: '', author: '', error: '' }, extra);

async function run({ search = '', seed = {}, page = PAGE_WALL, ai, native, provider = 'gemini', audio, files }) {
  const calls = { jina: 0, ai: [], oembed: 0, page: 0 };
  const dom = await JSDOM.fromURL(BASE + search, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
      w.localStorage.setItem('cfg', JSON.stringify({ provider, keys: { gemini: 'k', claude: 'k' }, jina: seed.jina !== false }));
      if (seed.items) w.localStorage.setItem('items', JSON.stringify(seed.items));
      w.fetch = async (url, opt) => {
        url = String(url);
        if (url.includes('graph.facebook.com')) { calls.oembed++; return resp({ html: EMBED }); }
        if (url.includes('r.jina.ai')) { calls.jina++; return resp('texte jina'); }
        if (url.includes('generativelanguage')) { calls.ai.push(JSON.parse(opt.body)); return resp({ candidates: [{ content: { parts: [{ text: JSON.stringify(ai) }] } }] }); }
        if (url.includes('api.anthropic.com')) { calls.ai.push(JSON.parse(opt.body)); return resp({ content: [{ type: 'text', text: JSON.stringify(ai) }] }); }
        if (url.includes('instagram.com')) { calls.page++; return resp(page); }
        throw new Error('URL inattendue : ' + url);
      };
      if (audio) { // faux Web Audio : 'duration' secondes, signal fort ou silencieux
        w.AudioContext = function () { this.decodeAudioData = async () => ({ duration: audio.duration }); this.close = () => {}; };
        w.OfflineAudioContext = function (ch, len) {
          this.createBufferSource = () => ({ connect() {}, start() {} }); this.destination = {};
          this.startRendering = async () => ({ getChannelData: () => { const a = new Float32Array(len); if (audio.loud) for (let i = 0; i < len; i++) a[i] = 0.3 * Math.sin(i / 20); return a; } });
        };
      }
      if (native) {
        let first = true;
        w.Capacitor = { isNativePlatform: () => true, registerPlugin: () => ({ addListener: async () => ({}), getPending: async () => { if (first) { first = false; return { text: native }; } return {}; } }) };
      }
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener('load', r));
  if (files) {
    const id = JSON.parse(w.localStorage.getItem('items'))[0].id;
    const list = files.map(([name, type]) => { const f = new w.File([new Uint8Array(2000)], name, { type }); f.arrayBuffer = async () => new ArrayBuffer(2000); return f; });
    w.enqueue(id, { files: list });
    await sleep(50);
    for (let i = 0; i < 60 && w.eval('running'); i++) await sleep(100);
  } else {
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const it = JSON.parse(w.localStorage.getItem('items') || '[]');
      if (it.length && it[0].status !== 'pending' && it[0].status !== 'working') break;
    }
    for (let i = 0; i < 20 && w.eval('running'); i++) await sleep(50);
  }
  const items = JSON.parse(w.localStorage.getItem('items') || '[]');
  const html = w.document.body.innerHTML;
  w.close();
  return { items, calls, html };
}
const parts = (call) => call.contents[0].parts;
const promptOf = (call) => parts(call)[0].text;

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); BASE = 'http://127.0.0.1:' + server.address().port + '/';
  const OKAI = { enough: true, title: 'x', summary: 'ok', points: [], category: 'Cuisine', tags: [] };

  // 1. Partage web (share_target) + aperçu exploitable
  let r = await run({ search: '?url=' + encodeURIComponent('https://www.instagram.com/reel/Cabc12345/?igsh=ZZ') + '&text=' + encodeURIComponent('regarde'),
    page: PAGE_OK, ai: { enough: true, title: 'Poulet citron', summary: 'Une recette rapide.', points: ['a'], category: 'Cuisine', tags: ['#Poulet'] } });
  let it = r.items[0];
  assert.equal(it.url, 'https://www.instagram.com/reel/Cabc12345/');
  assert.equal(it.status, 'done'); assert.equal(it.author, 'chef.lea'); assert.equal(it.category, 'Cuisine'); assert.deepEqual(it.tags, ['poulet']);
  assert.match(promptOf(r.calls.ai[0]), /Auteur : @chef\.lea/); assert.match(promptOf(r.calls.ai[0]), /Poulet citron en 15 min avec du riz/);
  assert.equal(r.calls.jina, 0, 'jina ne doit pas être appelé si l’aperçu direct suffit');
  assert.equal(r.calls.ai.length, 1, 'une seule analyse par partage');
  assert.match(r.html, /@chef\.lea/);
  console.log('1. partage web + aperçu OpenGraph + auteur, une seule analyse : OK');

  // 2. Mur de connexion, jina désactivé, auteur connu → « partial » + catégorie suggérée
  const done = (id) => blank(id, 'https://www.instagram.com/reel/Old' + id + '/', { status: 'done', author: 'chef.lea', category: 'Cuisine', title: 't', summary: 's' });
  r = await run({ search: '?url=' + encodeURIComponent('https://www.instagram.com/reel/Newcode123/'), seed: { jina: false, items: [done('aaaaa'), done('bbbbb')] },
    ai: { enough: false, title: '', summary: '', points: [], category: 'Autre', tags: [] } });
  it = r.items[0];
  assert.equal(it.status, 'partial'); assert.equal(it.category, 'Cuisine'); assert.match(it.error, /suggérée d’après l’auteur/);
  assert.equal(r.calls.jina, 0); assert.doesNotMatch(promptOf(r.calls.ai[0]), /Create an account/);
  console.log('2. mur de connexion ignoré, jina respecté, catégorie suggérée : OK');

  // 3. Mur de connexion, jina activé → repli
  r = await run({ search: '?url=' + encodeURIComponent('https://www.instagram.com/reel/Jina123456/'), ai: OKAI });
  assert.equal(r.calls.jina, 1); assert.match(promptOf(r.calls.ai[0]), /texte jina/);
  console.log('3. repli r.jina.ai quand activé : OK');

  // 4. Partage natif Android
  r = await run({ native: 'Regarde https://www.instagram.com/reel/Native1234/?igsh=1 trop bien', page: PAGE_OK, ai: OKAI });
  assert.equal(r.items[0].url, 'https://www.instagram.com/reel/Native1234/'); assert.equal(r.items[0].shared, 'Regarde  trop bien'); assert.equal(r.calls.ai.length, 1);
  console.log('4. partage natif (ShareIntent) : OK');

  // 5. Enregistrement d'écran → SEUL le son part, en WAV, avec transcription mémorisée
  const seed5 = { jina: false, items: [blank('p1', 'https://www.instagram.com/reel/Audio12345/')] };
  r = await run({ seed: seed5, audio: { duration: 30, loud: true }, files: [['rec.mp4', 'video/mp4']],
    ai: { enough: true, title: 'Recette', summary: 'Il explique la recette.', points: [], category: 'Cuisine', tags: [], transcript: 'Bonjour, aujourd’hui on fait un poulet citron.' } });
  assert.equal(r.calls.ai.length, 1);
  const media = parts(r.calls.ai[0]).filter((p) => p.inline_data);
  assert.equal(media.length, 1); assert.equal(media[0].inline_data.mime_type, 'audio/wav');
  assert.ok(!JSON.stringify(r.calls.ai[0]).includes('video/mp4'), 'aucune vidéo envoyée');
  const b64len = media[0].inline_data.data.length; // 44 + 30 s × 16 000 × 2 octets ≈ 960 ko → ≈ 1,28 M caractères base64
  assert.ok(b64len > 1.2e6 && b64len < 1.4e6, 'taille audio inattendue : ' + b64len);
  assert.match(promptOf(r.calls.ai[0]), /enregistrement audio du reel/); assert.match(promptOf(r.calls.ai[0]), /"transcript"/);
  assert.equal(r.items[0].status, 'done'); assert.match(r.items[0].transcript, /poulet citron/);
  console.log('5. vidéo → son seul (WAV ~1 Mo pour 30 s), transcription mémorisée : OK');

  // 5b. Réanalyse : la transcription mémorisée est réutilisée, rien n'est renvoyé ni relu sur le web
  const kept = Object.assign({}, r.items[0], { status: 'partial' });
  r = await run({ seed: { jina: false, items: [kept] }, files: [], ai: OKAI });
  assert.equal(r.calls.ai.length, 1); assert.equal(parts(r.calls.ai[0]).filter((p) => p.inline_data).length, 0);
  assert.match(promptOf(r.calls.ai[0]), /Transcription déjà obtenue : Bonjour, aujourd’hui/);
  assert.equal(r.calls.page + r.calls.jina, 0, 'pas de lecture web si on a déjà la transcription');
  console.log('5b. réanalyse sans renvoyer l’audio : OK');

  // 6. Enregistrement SANS son (micro seul) → erreur claire, aucun appel IA
  r = await run({ seed: seed5, audio: { duration: 30, loud: false }, files: [['rec.mp4', 'video/mp4']], ai: OKAI });
  assert.equal(r.calls.ai.length, 0); assert.equal(r.items[0].status, 'error'); assert.match(r.items[0].error, /Aucun son détecté/);
  console.log('6. enregistrement muet détecté avant tout appel IA : OK');

  // 7. Fournisseur sans audio (Claude) → refus clair, aucun appel IA ; les captures d'écran restent acceptées
  r = await run({ seed: seed5, provider: 'claude', audio: { duration: 30, loud: true }, files: [['rec.mp4', 'video/mp4']], ai: OKAI });
  assert.equal(r.calls.ai.length, 0); assert.match(r.items[0].error, /qu’avec Gemini/);
  r = await run({ seed: seed5, provider: 'claude', files: [['cap.png', 'image/png']], ai: OKAI });
  assert.equal(r.calls.ai.length, 1); assert.equal(r.calls.ai[0].messages[0].content[0].type, 'image'); assert.equal(r.items[0].status, 'done');
  console.log('7. audio refusé hors Gemini, captures d’écran OK avec Claude : OK');

  server.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });

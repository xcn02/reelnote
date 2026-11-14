const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../www/lib.js');

test('findUrl : texte de partage Instagram', () => {
  assert.equal(
    L.findUrl('Regarde ça https://www.instagram.com/reel/Cabc12345/?igsh=ZZ).'),
    'https://www.instagram.com/reel/Cabc12345/',
  );
  assert.equal(L.findUrl('https://vm.tiktok.com/ZM123/?a=b'), 'https://vm.tiktok.com/ZM123/?a=b');
  assert.equal(L.findUrl('aucun lien'), null);
  assert.equal(L.findUrl(''), null);
});

test('canonicalInstagram', () => {
  assert.equal(L.canonicalInstagram('https://www.instagram.com/some.user/reel/Cabc12345/'), 'https://www.instagram.com/reel/Cabc12345/');
  assert.equal(L.canonicalInstagram('https://instagram.com/reels/Cabc12345'), 'https://www.instagram.com/reel/Cabc12345/');
  assert.equal(L.canonicalInstagram('https://www.instagram.com/reels/'), null);
  assert.equal(L.canonicalInstagram('https://evil.com/reel/Cabc12345/'), null);
});

// Échantillons SYNTHÉTIQUES modelés sur le format d'aperçu connu ; à confronter à une vraie page.
const page = (head) => `<!doctype html><html><head>${head}</head><body></body></html>`;

test('aperçu : ordre des attributs, guillemets et entités', () => {
  const html = page(
    `<meta content='Chef Léa (@chef.lea) on Instagram: &quot;Poulet citron en 15 min&quot;' property="og:title">` +
    `<meta property="og:description" content="1,234 likes, 56 comments - chef.lea on March 3, 2025: &quot;Poulet citron en 15 min &amp; riz&quot;.">`,
  );
  const p = L.parsePreview(html);
  assert.equal(p.author, 'chef.lea');
  assert.match(p.title, /"Poulet citron en 15 min"/);
  assert.match(p.description, /citron en 15 min & riz/);
  assert.equal(p.usable, true);
});

test('aperçu : mur de connexion → inutilisable', () => {
  const html = page(
    `<meta property="og:title" content="Instagram">` +
    `<meta property="og:description" content="Create an account or log in to Instagram - Share what you're into with the people who get you.">`,
  );
  assert.equal(L.parsePreview(html).usable, false);
  const fr = page(`<meta property="og:description" content="Créez un compte ou connectez-vous à Instagram pour partager ce que vous aimez.">`);
  assert.equal(L.parsePreview(fr).usable, false);
});

test('aperçu : page vide ou description trop courte → inutilisable, sans erreur', () => {
  assert.equal(L.parsePreview('').usable, false);
  assert.equal(L.parsePreview(page('<meta property="og:description" content="Court">')).usable, false);
  assert.equal(L.parsePreview(undefined).author, null);
});

test('aperçu : un attribut data-property ne doit pas être pris pour property', () => {
  const p = L.parsePreview(page('<meta data-property="og:description" content="Ne doit pas apparaître dans le résultat">'));
  assert.equal(p.description, '');
});

test('oEmbed : auteur depuis le pied du blockquote (EN et FR)', () => {
  const embed = (t) => `<blockquote><div><a href="x">View this post</a><p><a href="x">${t}</a></p></div></blockquote><script async src="//www.instagram.com/embed.js"></script>`;
  assert.equal(L.parseOEmbedAuthor(embed('A post shared by Chef Léa (@chef.lea)')), 'chef.lea');
  assert.equal(L.parseOEmbedAuthor(embed('Une publication partagée par Chef Léa (@chef.lea)')), 'chef.lea');
  assert.equal(L.parseOEmbedAuthor('<blockquote>rien</blockquote>'), null);
});

test('catégorie dominante', () => {
  assert.equal(L.dominantCategory(['Cuisine', 'Cuisine', 'Cuisine', 'Voyage']), 'Cuisine');
  assert.equal(L.dominantCategory(['Cuisine', 'Voyage']), null);
  assert.equal(L.dominantCategory(['Cuisine']), null);
  assert.equal(L.dominantCategory([null, 'Autre', 'Autre']), null);
  assert.equal(L.dominantCategory([]), null);
});

test('WAV : en-tête PCM 16 bits mono et écrêtage', () => {
  const wav = L.encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]), 16000);
  const v = new DataView(wav);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(tag(12), 'fmt '); assert.equal(tag(36), 'data');
  assert.equal(wav.byteLength, 44 + 7 * 2);
  assert.equal(v.getUint32(4, true), wav.byteLength - 8);
  assert.equal(v.getUint16(20, true), 1);      // PCM
  assert.equal(v.getUint16(22, true), 1);      // mono
  assert.equal(v.getUint32(24, true), 16000);  // fréquence
  assert.equal(v.getUint16(34, true), 16);     // 16 bits
  assert.equal(v.getUint32(40, true), 14);     // taille des données
  const sample = (i) => v.getInt16(44 + i * 2, true);
  assert.equal(sample(0), 0);
  assert.equal(sample(3), 32767);              // 1  -> max
  assert.equal(sample(4), -32768);             // -1 -> min
  assert.equal(sample(5), 32767);              // 2  écrêté
  assert.equal(sample(6), -32768);             // -2 écrêté
});

test('WAV : 2 minutes à 16 kHz mono ≈ 3,8 Mo', () => {
  assert.equal(L.encodeWav(new Float32Array(16000 * 120), 16000).byteLength, 44 + 16000 * 120 * 2);
});

test('audioStats : silence vs son', () => {
  assert.ok(L.audioStats(new Float32Array(1000)).peak < 0.01);
  assert.ok(L.audioStats(new Float32Array([0, 0.002, -0.003])).peak < 0.01); // bruit de fond
  const loud = L.audioStats(new Float32Array([0, 0.4, -0.6]));
  assert.ok(Math.abs(loud.peak - 0.6) < 1e-6); assert.ok(loud.rms > 0.3);
  assert.deepEqual(L.audioStats(new Float32Array(0)), { peak: 0, rms: 0 });
});

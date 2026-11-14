/* Fonctions pures de ReelNote (testables sous Node, utilisables dans la page). */
const ReelLib = (() => {
  /** Premier lien du texte partagé ; pour Instagram, retire les paramètres de suivi. */
  function findUrl(s) {
    s = s || '';
    const m = s.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/i) || s.match(/https?:\/\/[^\s]+/i);
    if (!m) return null;
    let u = m[0].replace(/[)\]>.,;]+$/, '');
    if (/instagram\.com/i.test(u)) u = u.split('?')[0];
    return u;
  }

  /** Forme canonique d'un lien Instagram (/reel/CODE/), ou null. */
  function canonicalInstagram(url) {
    const m = String(url || '').match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,})/i);
    if (!m) return null;
    const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase();
    return `https://www.instagram.com/${kind}/${m[2]}/`;
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  function attr(tag, name) {
    const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i'));
    return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
  }

  /** Balises <meta> → { 'og:title': ..., description: ... } (première occurrence gagne). */
  function metaMap(html) {
    const map = {};
    const re = /<meta\b[^>]*>/gi;
    let m;
    while ((m = re.exec(html))) {
      const key = (attr(m[0], 'property') || attr(m[0], 'name') || '').toLowerCase();
      const content = attr(m[0], 'content');
      if (key && content != null && !(key in map)) map[key] = decodeEntities(content).trim();
    }
    return map;
  }

  // Textes génériques d'Instagram quand il affiche son mur de connexion au lieu du contenu.
  const LOGIN_WALL = /create an account or log in|créez un compte ou connectez|share what you'?re into|partagez ce qui vous passionne/i;

  /**
   * Aperçu « type carte de lien » d'une page publique, via ses balises OpenGraph.
   * `usable` est faux si la page est vide ou si c'est un mur de connexion.
   */
  function parsePreview(html) {
    const mm = metaMap(String(html || ''));
    const title = mm['og:title'] || '';
    const description = mm['og:description'] || mm['description'] || '';
    const handle = title.match(/\(@([A-Za-z0-9._]{1,30})\)/);
    const wall = LOGIN_WALL.test(description) || LOGIN_WALL.test(title);
    return {
      title,
      description,
      author: handle ? handle[1] : null,
      usable: !wall && description.length >= 20,
    };
  }

  /** Auteur depuis le HTML d'embed d'oEmbed (« A post shared by Nom (@handle) »). */
  function parseOEmbedAuthor(html) {
    const text = decodeEntities(
      String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '),
    ).replace(/\s+/g, ' ').trim();
    const m = text.match(/\(@([A-Za-z0-9._]{1,30})\)/);
    return m ? m[1] : null;
  }

  /**
   * Catégorie « habituelle » d'un auteur, apprise de la bibliothèque.
   * null si < 2 fiches utiles ou < 60 % d'accord ; « Autre » et vides sont ignorés.
   */
  function dominantCategory(cats) {
    const known = (cats || []).filter((c) => c && c !== 'Autre');
    if (known.length < 2) return null;
    const counts = new Map();
    known.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return n / known.length >= 0.6 ? top : null;
  }

  /** Échantillons float [-1, 1] → fichier WAV PCM 16 bits mono (ArrayBuffer). */
  function encodeWav(samples, sampleRate) {
    const n = samples.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const x = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return buf;
  }

  /** Niveau crête et RMS d'un signal : sert à détecter un enregistrement sans son (avant d'appeler l'IA). */
  function audioStats(samples) {
    let peak = 0, sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const a = Math.abs(samples[i]);
      if (a > peak) peak = a;
      sum += samples[i] * samples[i];
    }
    return { peak, rms: samples.length ? Math.sqrt(sum / samples.length) : 0 };
  }

  return { findUrl, canonicalInstagram, decodeEntities, metaMap, parsePreview, parseOEmbedAuthor, dominantCategory, encodeWav, audioStats };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ReelLib;

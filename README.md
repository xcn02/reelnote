# ReelNote

Bibliothèque personnelle de Reels : tu partages un lien depuis Instagram, l'app crée une fiche
(titre, résumé, points clés, catégorie, tags) avec l'IA de ton choix. Tout est stocké **sur le téléphone** ;
aucun serveur à héberger.

L'APK est compilé par **GitHub Actions** : pas besoin d'Android Studio.

## 1. Compiler l'APK sur GitHub

1. Crée un dépôt GitHub (privé ou public) et envoie-y tout le contenu de ce dossier
   (le dossier `.github` doit être à la racine du dépôt).
2. Onglet **Actions** : le workflow « Build APK » se lance seul à chaque envoi sur `main`
   (ou bouton **Run workflow**). Compte 5 à 10 minutes la première fois.
3. Récupère l'APK :
   - **Le plus simple (téléchargement direct sur le téléphone)** : crée un tag, par exemple
     `git tag v1.0.0 && git push origin v1.0.0`. L'APK apparaît dans l'onglet **Releases**.
   - Sinon, ouvre l'exécution du workflow et télécharge l'artefact `ReelNote-apk` (c'est un zip à extraire).
4. Sur le téléphone, ouvre le fichier `ReelNote.apk` et autorise l'installation depuis cette source.

## 2. Clé de signature stable (à faire une fois, recommandé)

Sans cette étape, chaque build est signé avec une clé jetable : Android refuse alors de mettre
l'app à jour par-dessus l'ancienne version. Il faudrait la désinstaller, **et tu perdrais ta bibliothèque**
(elle est stockée dans l'app). Pour l'éviter :

```bash
keytool -genkeypair -v -keystore debug.keystore -storepass android -keypass android \
  -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"
base64 -w0 debug.keystore        # macOS : base64 -i debug.keystore
```

Copie le texte obtenu dans GitHub : **Settings → Secrets and variables → Actions → New repository secret**,
nom `DEBUG_KEYSTORE_B64`. Garde `debug.keystore` en lieu sûr (il est exclu de Git) : si tu le perds,
tu perds la possibilité de mettre à jour par-dessus. Pense aussi à l'export JSON (⚙️) pour sauvegarder tes fiches.

## 3. Première utilisation

⚙️ Réglages → choisis l'IA, colle ta clé API, **Tester la connexion**.
Clé Gemini gratuite : <https://aistudio.google.com/apikey>. La clé reste sur le téléphone.
Si le test échoue avec « modèle introuvable », corrige le nom du modèle (les noms changent souvent).

Ensuite, dans Instagram : **Partager → ReelNote**. L'analyse démarre toute seule.

## 4. D'où vient le contenu de la fiche

Dans l'ordre, chaque étape pouvant échouer sans casser la suivante :

| Étape | Donne | Remarque |
|---|---|---|
| oEmbed officiel de Meta | l'auteur | sans token ; ni légende ni miniature |
| Aperçu du lien (balises OpenGraph) | un extrait de légende si la page est publique | Instagram affiche souvent un mur de connexion : l'extrait est alors ignoré |
| Lecteur externe `r.jina.ai` | texte de la page | **désactivable** dans les réglages : le lien passe sinon par un service tiers |
| Tes ajouts (fiche → légende, capture d'écran, son) | le contenu réel | fiable à 100 % |

Si rien n'est exploitable, la fiche passe en **« à compléter »** au lieu d'inventer un résumé. Pour les Reels
sans description, ouvre la fiche et ajoute :

- une **capture d'écran** (texte incrusté, sous-titres, liste d'ingrédients…), lue par n'importe quelle IA ;
- ou un **enregistrement d'écran** (ou un fichier audio) du Reel, pour **la voix**.

**Seul le son est envoyé, jamais la vidéo.** Il est extrait sur le téléphone puis converti en WAV 16 kHz mono
(≈ 2 Mo par minute, 2 minutes maximum). Chez Gemini, l'audio compte pour 32 tokens par seconde (1 min ≈ 1 920 tokens),
contre environ 300 par seconde pour la vidéo : environ **10 fois moins cher**. La transcription obtenue est gardée dans
la fiche (et incluse dans la recherche) : relancer une analyse ne renvoie plus l'audio.

Points d'attention :
- L'analyse du son n'est disponible qu'avec **Gemini** ; avec Claude ou OpenAI, seules les captures d'écran sont lues.
- Dans l'enregistreur d'écran d'Android, active le **son interne / son du média** : avec le micro seul, l'app détecte
  l'absence de son et s'arrête **avant** tout appel à l'IA.
- Vérifie sur un Reel en français que la transcription est correcte avec le modèle choisi.

Quand l'auteur revient souvent avec la même catégorie, elle est proposée sur les fiches à compléter.

## 5. Développement local

```bash
npm ci
npm test            # tests unitaires + test de bout en bout de la page (jsdom, réseau simulé)
npx cap sync android
```

- `www/` : l'application web (`index.html`, `lib.js`). Elle fonctionne aussi comme **PWA** : hébergée en
  HTTPS puis « Ajouter à l'écran d'accueil » depuis Chrome, elle accepte aussi le partage.
- `android/` : projet Android généré par Capacitor. Seuls `ShareIntentPlugin.java`, `MainActivity.java`
  et `AndroidManifest.xml` ont été modifiés (réception du partage, sauvegardes Google désactivées pour que
  tes clés API n'y partent pas).
- Dans l'app Android, `fetch()` passe par le réseau natif (`CapacitorHttp`) : pas de blocage CORS.

## 6. Ce qui est vérifié, et ce qui ne l'est pas

Vérifié par les tests : détection des liens, extraction de l'aperçu et de l'auteur sur des **échantillons écrits
à la main**, repli entre les étapes, une seule analyse par partage, catégorie suggérée, partage natif simulé,
encodage WAV, détection d'un enregistrement muet, envoi du seul son (jamais de vidéo), réutilisation de la
transcription, syntaxe du workflow.

**Non vérifié** (pas d'environnement Android ni de réseau Meta/Instagram à disposition lors de l'écriture) :

- la **compilation Android** : si le premier build échoue, ouvre le journal de l'étape « Compiler l'APK » ;
- le **plugin Java de partage** sur un vrai téléphone ;
- l'**extraction du son** : le test simule le moteur audio. Il faut vérifier que la WebView Android sait décoder la piste
  audio d'un enregistrement d'écran (.mp4). Si ce n'est pas le cas, le message « Impossible de lire le son » s'affiche ;
  la parade est alors d'ajouter un petit décodeur natif ;
- le **format réel** des réponses oEmbed et des pages Instagram. Si l'auteur n'est jamais détecté, ou si
  l'aperçu est toujours vide, il faut ajuster `parseOEmbedAuthor` / `parsePreview` dans `www/lib.js`
  avec une vraie réponse (c'est volontairement isolé et testé à cet endroit) ;
- le nom de modèle par défaut de Gemini (modifiable dans les réglages).

## 7. Icône de l'app

L'icône du lanceur Android est celle par défaut de Capacitor. Pour la remplacer :
`npx @capacitor/assets generate --android` avec un `assets/icon-only.png` (1024×1024).

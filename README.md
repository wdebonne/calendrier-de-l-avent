# 🎄 Calendrier de l'Avent

Application web pour créer des calendriers de l'Avent personnalisés : une case par jour (par défaut du 1er au 24 décembre), qui révèle une photo, une vidéo, une vidéo YouTube/Vimeo, un lien ou un message, avec animations, défis, QR code et statistiques.

## Fonctionnalités

**Calendriers**
- Plage de dates libre (1er → 24 décembre par défaut, jusqu'à 366 jours) avec fuseau horaire.
- Lien unique : code numérique aléatoire non devinable par défaut (`/c/4380861023`), personnalisable.
- Ouverture **seulement le jour venu** (vérifiée côté serveur) ou **toutes les cases ouvrables**.
- **Aperçu créateur** : ouvre toutes les cases pour tester, sans fausser les statistiques.
- Mot de passe d'accès optionnel, publication / brouillon, duplication.
- Apparence : 6 thèmes prêts à l'emploi, couleurs, image de fond, police, forme des cases, disposition mélangée, neige.
- Animations au clic (porte 3D, retournement, cadeau, papier déchiré…) et effets d'ouverture (confettis, flocons, étoiles, feu d'artifice…), réglables par case.
- Contenu par case : upload de photos/vidéos (glisser-déposer) ou lien externe.

**Défis pour ouvrir une case** — modèles prêts à l'emploi, personnalisables et testables dans l'éditeur :
énigme (tolérante aux majuscules, accents et articles), code/cadenas, QCM, vrai/faux, mot mélangé, memory, taquin.
Indices progressifs (après N erreurs et/ou N secondes), nombre d'essais limité, messages de réussite et d'échec.
Les réponses ne sont **jamais envoyées au navigateur** : la vérification se fait côté serveur.

**QR code** : couleurs, dégradé, style des points et des coins, logo, marge, correction d'erreur ; export PNG, SVG, JPEG, WEBP et impression avec légende. Les scans sont distingués dans les statistiques.

**Statistiques** : visites, visiteurs uniques, provenance (QR / lien), ouvertures par jour et par case, activité par heure, clics trop tôt, temps de visionnage, réussite des défis (tentatives, taux, temps moyen, indices). Filtres par période, export CSV, vue globale admin.

**Administration**
- Utilisateurs : administrateurs et créateurs, invitation par email, lien de réinitialisation, activation.
- SMTP configurable avec **bouton d'email de test** (mot de passe chiffré en base).
- Mot de passe oublié : activable, durée du lien, modèles d'email FR/EN.
- Sécurité : anti-force brute (seuil, période, durée, blocage progressif, verrouillage de compte), appliqué aussi aux mots de passe de calendrier et aux défis ; **liste blanche / liste noire** IP et CIDR (IPv4/IPv6) ; liste des blocages avec déblocage.
- Base de données : **SQLite pour tester, bascule vers PostgreSQL depuis l'interface** (copie des données incluse).

Interface en français et en anglais.

## Démarrage rapide (Docker)

L'image est construite automatiquement par GitHub Actions et publiée sur `ghcr.io/wdebonne/calendrier-de-l-avent` : le serveur n'a qu'à la télécharger.

```bash
cp .env.example .env      # facultatif
docker compose up -d
```

Pour construire l'image vous-même depuis les sources :

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

> **Antivirus avec inspection HTTPS** (Norton, Kaspersky, Avast…) : un build local échoue avec `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, car les conteneurs ne font pas confiance au certificat de l'antivirus. Utilisez l'image pré-construite (méthode par défaut) ou désactivez l'analyse HTTPS le temps du build.

Ouvrez `http://localhost:3000` : l'assistant crée le compte administrateur au premier lancement (ou définissez `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

Toutes les données (base SQLite, médias, secret) sont dans le volume `advent-data` monté sur `/app/data` : **sauvegardez ce volume**.

## Déploiement avec Portainer depuis GitHub

1. Poussez ce dépôt sur GitHub.
2. Dans Portainer : **Stacks → Add stack → Repository**.
   - *Repository URL* : `https://github.com/<vous>/<depot>` (ajoutez un jeton si le dépôt est privé).
   - *Compose path* : `docker-compose.yml` (SQLite) ou `docker-compose.postgres.yml` (avec PostgreSQL).
     Pour construire sur le serveur plutôt que télécharger l'image, ajoutez `docker-compose.build.yml` dans *Additional paths*.
   - *Environment variables* : au minimum `APP_URL` (l'URL publique, utilisée dans les emails et le QR code) et, si vous utilisez PostgreSQL, `POSTGRES_PASSWORD`.
   - Activez **GitOps updates** (polling ou webhook) pour redéployer à chaque push.
3. **Deploy the stack.**

> **Image** : à chaque push sur `main`, le workflow `.github/workflows/docker.yml` teste le code puis publie l'image `ghcr.io/wdebonne/calendrier-de-l-avent:latest`. Au premier envoi, le paquet est **privé** : rendez-le public (GitHub → *Packages* → *Package settings* → *Change visibility*) ou ajoutez le registre `ghcr.io` avec un jeton dans Portainer (*Registries*). Pour redéployer une nouvelle version, utilisez *Pull and redeploy* sur la stack. Pour une autre image, définissez la variable `IMAGE`.

**Derrière un reverse proxy HTTPS** (Nginx Proxy Manager, Traefik…) : mettez `COOKIE_SECURE=true` et laissez `TRUST_PROXY=true` pour que l'anti-force brute voie la vraie IP des visiteurs. Si l'application est exposée **sans** proxy, mettez `TRUST_PROXY=false` (sinon un client pourrait falsifier son IP via l'en-tête `X-Forwarded-For`).

## Passer de SQLite à PostgreSQL

1. Déployez `docker-compose.postgres.yml` (ou toute instance PostgreSQL accessible).
2. **Admin → Paramètres → Base de données** : saisissez hôte (`postgres` dans la stack fournie), base, utilisateur et mot de passe, puis **Tester la connexion**.
3. **Copier les données et basculer** : la structure est créée, toutes les données sont copiées dans une transaction et les nombres de lignes sont vérifiés.
4. **Redémarrer l'application** (le conteneur redémarre tout seul grâce à `restart: unless-stopped`).

Le fichier SQLite est conservé : **Revenir à SQLite** reste possible (les données créées entre-temps sur PostgreSQL ne sont pas reprises). Vous pouvez aussi imposer PostgreSQL avec la variable `DATABASE_URL` ; l'interface passe alors en lecture seule pour ce réglage.

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `APP_URL` | URL publique (emails, QR code) | origine de la requête |
| `APP_SECRET` | Secret de signature et de chiffrement (≥ 16 caractères) | généré dans `/app/data/secret.key` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Crée le premier admin si aucun utilisateur n'existe | — |
| `DATABASE_URL` | Impose PostgreSQL (`postgres://…`) | SQLite |
| `DATA_DIR` | Dossier des données | `/app/data` |
| `TRUST_PROXY` | Lire l'IP réelle dans `X-Forwarded-For` | `true` |
| `COOKIE_SECURE` | Cookies `Secure` (HTTPS) | `false` |
| `TZ` | Fuseau du serveur | `Europe/Paris` |

## Développement

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests unitaires (dates, défis, IP/CIDR, slugs)
npm run lint       # vérification TypeScript
npm run build
```

Stack : Next.js 16 (App Router), React 19, Tailwind CSS 4, Kysely (SQLite via better-sqlite3 / PostgreSQL via pg), next-intl, Framer Motion, Recharts, qr-code-styling, Nodemailer, Argon2.

## Notes de sécurité

- Mots de passe hachés avec Argon2id, sessions en cookie httpOnly (jeton stocké haché).
- Le contenu d'une case n'est envoyé qu'après vérification serveur de la date, du mot de passe et du défi.
- Les mini-jeux (memory, taquin) se jouent dans le navigateur : le serveur reçoit seulement « terminé ». Utilisez énigme, code ou QCM quand la case doit être réellement protégée.
- Les médias sont servis via des identifiants aléatoires : quiconque possède l'URL d'un média peut l'afficher.
- Les IP sont hachées (salées) dans les statistiques.

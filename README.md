# TerroristKart

Jeu de karts en mode bataille, dans le navigateur : fonce dans les boîtes « ? » pour gagner une arme au hasard (minigun, canon, boule de feu, roquettes, mines, laser, onde de choc, bouclier, turbo) et fais le plus d'éliminations avant la fin du chrono.

- Solo contre des bots, ou jusqu'à 4 en écran partagé (manettes + clavier ZQSD / flèches)
- En ligne entre amis, même sur des réseaux différents : l'hôte crée une partie et donne son code de 5 lettres
- 12 pilotes, 8 peintures de kart, une arène (Candy Arena)

## Lancer en local

```bash
node server.js
```

Puis ouvrir http://localhost:3002. Aucune dépendance à installer (three.js et PeerJS sont chargés depuis jsDelivr, il faut internet).

## Jouer en ligne

Le jeu est un site statique : n'importe quel hébergeur statique (GitHub Pages, Netlify, itch.io…) convient. Chaque joueur ouvre la même adresse, l'hôte clique sur **En ligne → Créer une partie** et partage le code.
La connexion est en pair-à-pair (WebRTC) ; le serveur public PeerJS sert seulement à la mise en relation. Certains réseaux très fermés (4G de certains opérateurs, réseaux d'entreprise) peuvent bloquer la connexion directe.

## Commandes

| | Manette | Clavier (joueur gauche) | Clavier (joueur droit) |
|---|---|---|---|
| Accélérer | RT ou A | Z | ↑ |
| Freiner / reculer | LT ou B | S | ↓ |
| Tourner | stick gauche | Q / D | ← / → |
| Saut / drift (maintenir) | RB | Shift gauche | Shift droit |
| Tirer | LB ou X | Espace | Entrée |
| Regarder derrière | Y | C | J |
| Pause | Start | Échap | Échap |

Seul au clavier, toutes les touches marchent. Maintiens le drift dans un virage : les étincelles passent bleu → orange → violet, relâche pour un mini-turbo.

## Code

- `src/main.js` : menus, garage, salons local / en ligne, résultats
- `src/game.js` : boucle de jeu, autorité de l'hôte (dégâts, kills, boîtes), caméras, split-screen
- `src/kart.js` : physique arcade et animation des karts
- `src/map.js` : arène, collisions, graphe de navigation des bots
- `src/weapons.js`, `src/bot.js`, `src/fx.js`, `src/hud.js`, `src/audio.js`, `src/net.js`, `src/input.js`, `src/characters.js`

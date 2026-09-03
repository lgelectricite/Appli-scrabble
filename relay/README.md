# Le relais des parties en ligne 🌍

Ce dossier contient le **petit serveur** qui permet de jouer à GGgames **à
distance** (chacun chez soi, en 4G comme en Wi-Fi), avec un simple **code de
partie à 6 caractères**.

Le reste de l'application n'en a pas besoin : **tout le jeu hors ligne**
(sur un téléphone, ou à plusieurs sur le même Wi-Fi par QR code) **continue
de fonctionner sans lui**.

## Ce qu'il fait — et surtout ce qu'il ne fait pas

Il **transmet des messages, point**. Il ne connaît pas les règles, ne calcule
aucun score, ne voit pas vos cartes : c'est toujours le **téléphone qui crée
la partie** qui arbitre, exactement comme aujourd'hui. Le relais ne fait que
mettre les téléphones en relation et faire suivre des paquets scellés.

- Il **ne stocke rien** : aucune base de données, aucun historique, aucun
  compte. Quand la partie se termine, il ne reste rien.
- Un salon **se met en veille** dès que personne ne parle : une partie en
  attente ne consomme rien.
- Un invité ne peut parler qu'à l'hôte : personne ne peut se faire passer
  pour l'arbitre ni écrire dans le dos des autres.

## L'installer (3 clics, gratuit, sans carte bancaire)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lgelectricite/Appli-scrabble/tree/main/relay)

1. Cliquez sur le bouton ci-dessus.
2. Créez un compte Cloudflare gratuit si vous n'en avez pas (une adresse
   e-mail suffit, **aucune carte bancaire n'est demandée**).
3. Laissez les noms proposés et validez : le relais se déploie tout seul.
4. Cloudflare vous donne une adresse du type
   `https://gggames-relais.<votre-compte>.workers.dev` — **c'est elle qu'il
   faut coller dans l'application**, dans l'écran « 🌍 En ligne → Réglages du
   serveur ».

Pour vérifier que tout va bien, ouvrez cette adresse dans un navigateur :
elle doit répondre « Relais GGgames — en service. »

### Est-ce que ça restera gratuit ?

Le plan gratuit de Cloudflare offre **100 000 échanges par jour**, et rien
n'est décompté pendant qu'une partie attend (mise en veille). Un coup joué
pèse entre 60 octets et 4 Ko selon le jeu : une famille qui joue tous les
jours utilise de l'ordre de **1 % du quota**. En cas de dépassement, le
service s'arrête jusqu'au lendemain — il n'y a **jamais de facture
surprise**.

## Pour les curieux : le protocole

Une seule adresse : `wss://<votre-relais>/salon/<CODE>?r=h` pour l'hôte,
`…?r=g` pour un invité.

| Message | Sens | Contenu |
|---|---|---|
| `{sys:'bienvenue', id, hote}` | relais → téléphone | connexion acceptée |
| `{sys:'refus', pourquoi}` | relais → téléphone | `pris`, `inconnu` ou `plein` |
| `{sys:'entre', id}` / `{sys:'sort', id}` | relais → hôte | un invité arrive ou part |
| `{sys:'hote-parti'}` | relais → invités | l'hôte a quitté |
| `{a:'<id>'\|'*', d:…}` | hôte → relais | à transmettre à un invité, ou à tous |
| `{d:…}` | invité → relais | à transmettre à l'hôte |
| `{de:'<id>', d:…}` | relais → téléphone | message reçu, avec son expéditeur |

Le champ `d` n'est **jamais lu par le relais**.

Codes de fermeture : `4001` code déjà pris · `4002` code inconnu ·
`4003` salon complet · `4004` message trop gros ou débit excessif.

## Le lancer chez soi (facultatif)

```sh
cd relay
npm install
npm run dev      # relais local sur ws://127.0.0.1:8787
```

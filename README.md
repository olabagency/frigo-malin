<p align="center"><img src="custom_components/frigo_malin/brand/icon.png" width="120" alt="Frigo Malin"></p>

# Frigo Malin par Adri 🥕

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz)
[![Validation](https://github.com/olabagency/frigo-malin/actions/workflows/validate.yml/badge.svg)](https://github.com/olabagency/frigo-malin/actions/workflows/validate.yml)

Une intégration Home Assistant pour cuisiner avec ce qu'il y a dans le frigo, garder ses recettes au même endroit et préparer les courses de la semaine.

## Ce que fait Frigo Malin

**📸 Photo du frigo → recettes**
Prenez le frigo en photo depuis l'app Home Assistant. L'IA reconnaît les ingrédients, vous corrigez la liste, puis elle propose des recettes classiques ou plus créatives, en indiquant ce qu'elles utilisent et ce qu'il faudrait acheter.

**📖 Carnet de recettes**
- Ajout à la main, ou depuis l'adresse d'une recette (Jow, Marmiton, 750g, Cuisine AZ, la plupart des blogs).
- Favoris, mots-clés, notes personnelles.
- Portions ajustables : les quantités se recalculent.
- Mode « cuisine » : une étape à la fois, en grand, l'écran reste allumé. On passe d'une étape à l'autre en balayant l'écran.

**🥘 Recettes Jow**
Les quelque 3 700 recettes de jow.fr à chercher par plat ou ingrédient, et à importer d'un appui avec les quantités adaptées au foyer.

**📖 Recette en photo**
Une page de livre, de magazine ou la fiche manuscrite de mamie : une photo (ou plusieurs pages) et la recette arrive dans le carnet.

**✨ Planifier ma semaine**
Un bouton, et l'IA propose un menu équilibré, de saison, dans votre budget, rapide en semaine et plus élaboré le week-end. Avec la cuisine des restes : le poulet rôti du dimanche devient la salade du lundi.

**👨‍👩‍👧 Profils du foyer**
Âge, régime, allergies, épices et dégoûts de chacun, équipement de la cuisine, temps disponible, budget : toutes les propositions en tiennent compte, et les portions sont calculées pour vous.

**🛒 Liste de courses**
Un onglet Courses affiche votre liste de Home Assistant en direct, rangée par rayon. Ajout rapide en texte libre (« 2 kg de pommes, lait ») ou en un appui sur vos articles habituels, depuis l'onglet ou le bouton 🛒+ présent partout. Les ingrédients des repas planifiés s'ajoutent en un geste, et un article déjà présent voit sa quantité augmenter au lieu d'être dupliqué.

**🗓️ Menu de la semaine et liste de courses**
Planifiez vos repas midi et soir. Les ingrédients s'ajoutent automatiquement à une liste de courses de Home Assistant, avec les quantités adaptées au nombre de personnes et regroupées entre recettes (500 g + 600 g de tomates = 1,1 kg). Le sel, le poivre et l'eau ne sont jamais ajoutés (modifiable).

L'interface s'ouvre en plein écran depuis la barre latérale, est pensée d'abord pour le téléphone et reprend le thème de votre Home Assistant, en clair comme en sombre.

## Installation

### Avec HACS (recommandé)

1. Dans HACS, menu ⋮ → **Dépôts personnalisés**.
2. Ajoutez `https://github.com/olabagency/frigo-malin`, catégorie **Intégration**.
3. Cherchez **Frigo Malin**, installez, puis redémarrez Home Assistant.

### À la main

Copiez le dossier `custom_components/frigo_malin` dans le dossier `config/custom_components/` de Home Assistant, puis redémarrez.

## Configuration

1. **Paramètres → Appareils et services → Ajouter une intégration → Frigo Malin.**
2. Choisissez l'IA : **Claude (Anthropic)** ou **OpenAI**.
3. Collez votre clé API :
   - Claude : [console.anthropic.com](https://console.anthropic.com/settings/keys)
   - OpenAI : [platform.openai.com](https://platform.openai.com/api-keys)
4. **Frigo Malin** apparaît dans la barre latérale.

Aucun fichier YAML à modifier.

### Réglages (bouton « Configurer » de l'intégration)

| Réglage | Par défaut |
| --- | --- |
| Modèle d'IA | `claude-opus-5-5` pour Claude, `gpt-5-mini` pour OpenAI |
| Liste de courses | `todo.shopping_list` (intégration « Liste de courses » de HA) |
| Ajouter les ingrédients automatiquement en planifiant | Oui |
| Ingrédients à ne jamais ajouter | `sel, poivre, eau` |
| Portions par défaut | 4 |

Pour changer de fournisseur ou de clé : menu ⋮ de l'intégration → **Reconfigurer**.

N'importe quelle liste « todo » fonctionne : la liste de courses intégrée, Bring!, Todoist, etc.

### Côté coûts

Chaque photo analysée et chaque série d'idées font un appel à l'IA, facturé par votre fournisseur sur votre clé. L'import d'une recette depuis une adresse est gratuit quand le site publie sa recette dans un format standard (c'est le cas de Marmiton) ; l'IA n'est appelée qu'en secours.

## Avec la maison connectée

- **Mode magasin et rappel** : dans ⚙️ Réglages → Magasins, rangez les rayons dans l'ordre de votre magasin et reliez-le à une zone Home Assistant (Paramètres → Zones). Quand quelqu'un y arrive avec l'app Home Assistant sur son téléphone, il reçoit la liste ; un appui l'ouvre, rangée pour ce magasin.
- **Carte « Ce soir on mange… »** : Modifier le tableau de bord → Ajouter une carte → *Frigo Malin – Ce soir on mange*.
- **Capteur `sensor.frigo_malin_prochain_repas`** : nom du prochain repas, avec en attributs le créneau (`label` : « Ce soir »…), les portions, les temps, la photo et un lien direct. Exemple d'automatisation : annoncer le repas du soir sur les enceintes à 18 h.

## Mises à jour

Frigo Malin suit une numérotation `majeure.mineure.correctif` (voir [CHANGELOG.md](CHANGELOG.md)) :

- **HACS** affiche les nouvelles versions dans **Paramètres → Mises à jour**, comme pour le reste de Home Assistant. Installez, puis redémarrez HA.
- Après le redémarrage, une **notification** dans Home Assistant annonce la nouvelle version, avec un lien vers les nouveautés.
- Si votre téléphone affiche encore l'ancienne interface (cache de l'app), une bannière **« Nouvelle version installée »** propose de recharger.
- Vos recettes, votre menu et vos réglages sont conservés : quand le format des données change, Frigo Malin les convertit automatiquement au premier démarrage.

La version installée est affichée en bas des onglets Frigo et Recettes.

## Où sont mes données ?

Les recettes et le menu sont stockés localement dans `config/.storage/frigo_malin.data` et inclus dans les sauvegardes de Home Assistant. Seules les photos et les listes d'ingrédients partent chez le fournisseur d'IA choisi, au moment où vous le demandez.

## Commandes de drive (à venir)

La V1 laisse la place pour commander les courses en ligne. Le premier prévu est **Leclerc Drive**, via le connecteur de skunkobi, qui doit tourner sur un Mac ou un PC allumé. Le code est prêt à l'accueillir dans `custom_components/frigo_malin/drive/`.

## Développement

```bash
pip install -r requirements_test.txt
```

```bash
pytest
```

### Publier une nouvelle version

1. Montez la version partout d'un coup (manifest, code Python, panneau, CHANGELOG) :

   ```bash
   python3 scripts/bump_version.py minor
   ```

   (`patch` pour un correctif, `minor` pour une nouveauté, `major` pour un changement important, ou un numéro précis comme `1.4.0`.)
2. Complétez la section créée dans `CHANGELOG.md`, committez et poussez sur `main`.
3. Sur GitHub, publiez une **release** nommée `v1.1.0` (même numéro). HACS la propose alors en mise à jour ; un workflow vérifie que le numéro du tag correspond au code.

Si le format des données enregistrées change, augmentez `STORAGE_MINOR_VERSION` (ajout compatible) ou `STORAGE_VERSION` (changement de structure) dans `const.py` et écrivez la conversion dans `store.py`. Pour les réglages de l'intégration, c'est `MINOR_VERSION` / `VERSION` dans `config_flow.py` et `async_migrate_entry` dans `__init__.py`.

### Icône

Les images de l'icône et du logo sont dans `custom_components/frigo_malin/brand/` (`icon.png`, `logo.png`, versions `@2x` et sombres), au format demandé par Home Assistant et par le dépôt [home-assistant/brands](https://github.com/home-assistant/brands).

L'interface est un seul fichier JavaScript sans dépendance ni build : `custom_components/frigo_malin/frontend/frigo-malin-panel.js`.

## Licence

MIT

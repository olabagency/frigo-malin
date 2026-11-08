# Frigo Malin 🥕

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz)
[![Validation](https://github.com/olabagency/frigo-malin/actions/workflows/validate.yml/badge.svg)](https://github.com/olabagency/frigo-malin/actions/workflows/validate.yml)

Une intégration Home Assistant pour cuisiner avec ce qu'il y a dans le frigo, garder ses recettes au même endroit et préparer les courses de la semaine.

## Ce que fait Frigo Malin

**📸 Photo du frigo → recettes**
Prenez le frigo en photo depuis l'app Home Assistant. L'IA reconnaît les ingrédients, vous corrigez la liste, puis elle propose des recettes classiques ou plus créatives, en indiquant ce qu'elles utilisent et ce qu'il faudrait acheter.

**📖 Carnet de recettes**
- Ajout à la main, ou depuis l'adresse d'une recette (Marmiton, 750g, Cuisine AZ, la plupart des blogs).
- Favoris, mots-clés, notes personnelles.
- Portions ajustables : les quantités se recalculent.
- Mode « cuisine » : une étape à la fois, en grand, l'écran reste allumé. On passe d'une étape à l'autre en balayant l'écran.

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

L'interface est un seul fichier JavaScript sans dépendance ni build : `custom_components/frigo_malin/frontend/frigo-malin-panel.js`.

## Licence

MIT

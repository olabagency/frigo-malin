# Nouveautés de Frigo Malin

Toutes les évolutions notables sont listées ici. Les numéros de version suivent
[SemVer](https://semver.org/lang/fr/) :

- **correctif** (1.0.**1**) : corrections, rien ne change pour vous ;
- **mineure** (1.**1**.0) : nouvelles fonctions, vos recettes et réglages sont conservés ;
- **majeure** (**2**.0.0) : changement important, lisez les notes avant de mettre à jour.

## [1.1.0] – 2026-11-08

### Ajouté

- Onglet **Courses** : la liste de courses de Home Assistant, en direct, rangée par rayon (fruits et légumes, crèmerie, épicerie…). On coche, on supprime, on vide le panier, et les changements faits ailleurs (app HA, autre téléphone) apparaissent tout de suite.
- **Ajout rapide** depuis l'onglet Courses ou le bouton 🛒+ en haut de chaque écran. On écrit librement (« 2 kg de pommes, lait ») ou on touche un de ses articles habituels : les suggestions apprennent de ce que vous ajoutez.
- **Depuis le menu** : ajout en un geste des ingrédients des repas planifiés cette semaine ou la semaine prochaine.
- Pas de doublons : ajouter des tomates déjà sur la liste additionne les quantités (500 g + 300 g → 800 g) au lieu de créer une deuxième ligne.
- Le nom des recettes concernées s'affiche sous chaque ingrédient, quand la liste le permet.
- Pastille sur l'onglet Courses avec le nombre d'articles à acheter.

### Données

- Vos données sont converties automatiquement au démarrage pour accueillir l'historique des courses.

## [1.0.2] – 2026-11-08

### Corrigé

- Import depuis une adresse : la page était lue en partie seulement (premier morceau reçu), si bien que la recette de Marmiton n'était jamais trouvée. La page est maintenant lue en entier.
- Les fiches recettes écrites sans guillemets (`type=application/ld+json`, pages compressées) sont reconnues.
- Les recettes décrites en microdonnées (`itemprop`) sont aussi reconnues.
- Le CSS et le JavaScript ne sont plus envoyés à l'IA quand elle doit lire la page.

## [1.0.1] – 2026-11-08

### Corrigé

- Import depuis une adresse (Marmiton notamment) : les fiches recettes légèrement mal formées sont maintenant lues.
- Quand la fiche est absente, l'IA reçoit la partie de la page qui contient la recette, et non plus le début de la page (menus, publicités).
- Installation par HACS : elle ne dépend plus d'une archive de release.
- Message plus clair quand un site bloque l'import, et détails dans le journal de Home Assistant.

## [1.0.0] – 2026-11-08

Première version.

### Ajouté

- Photo du frigo : reconnaissance des ingrédients par l'IA, liste modifiable, idées de recettes classiques ou créatives.
- Carnet de recettes : saisie à la main, import depuis une adresse (Marmiton, 750g…), favoris, notes, portions ajustables, mode cuisine.
- Menu de la semaine, avec ajout automatique des ingrédients à une liste de courses de Home Assistant.
- Choix entre Claude et OpenAI, avec votre propre clé API.
- Panneau plein écran dans la barre latérale, adapté au téléphone, en clair comme en sombre.
- Logo et icônes : icône de l'intégration, pictogrammes colorés et emoji pour les ingrédients et les plats.
- Annonce des mises à jour dans Home Assistant, et rechargement proposé quand l'app affiche une ancienne version.
- Conversion automatique des données et des réglages lors des futures mises à jour.

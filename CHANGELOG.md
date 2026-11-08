# Nouveautés de Frigo Malin

Toutes les évolutions notables sont listées ici. Les numéros de version suivent
[SemVer](https://semver.org/lang/fr/) :

- **correctif** (1.0.**1**) : corrections, rien ne change pour vous ;
- **mineure** (1.**1**.0) : nouvelles fonctions, vos recettes et réglages sont conservés ;
- **majeure** (**2**.0.0) : changement important, lisez les notes avant de mettre à jour.

## [1.2.1] – 2026-11-08

### Corrigé

- Dans les fenêtres (réglages, personne, magasin…), chaque choix faisait clignoter l'écran et apparaître l'onglet Frigo une fraction de seconde. L'animation ne joue plus qu'à l'ouverture d'une nouvelle fenêtre.

## [1.2.0] – 2026-11-08

### Ajouté

- **Recette en photo** : photographiez une page de livre, de magazine ou une fiche manuscrite (jusqu'à 4 pages). L'IA la recopie fidèlement, vous relisez, c'est dans le carnet.
- **Planifier ma semaine** (onglet Semaine) : choisissez les repas à préparer, l'IA propose un menu équilibré, de saison, qui respecte votre budget et votre temps (rapide en semaine, plus élaboré le week-end). Vous retirez ce qui ne vous plaît pas, puis tout part au menu et dans la liste de courses.
- **Cuisine des restes** : dans le menu proposé, un plat cuisiné en double se transforme plus tard en un autre repas (poulet rôti → salade de poulet), avec moins de courses au total.
- **Réglages du foyer** (⚙️ en haut) : chaque personne avec son âge, son régime, ses allergies, ses épices et ce qu'elle n'aime pas ; temps disponible, budget, équipement, cuisines et objectifs. Toutes les propositions de l'IA en tiennent compte, et les portions sont calculées automatiquement (un enfant compte pour ½).
- **Mode magasin** : rangez les rayons dans l'ordre de votre magasin ; la liste de courses suit cet ordre.
- **Rappel en arrivant au magasin** : reliez un magasin à une zone Home Assistant. Quand quelqu'un y arrive et que la liste n'est pas vide, son téléphone reçoit « 🛒 12 articles à acheter » ; un appui ouvre la liste, rangée pour ce magasin.
- **Carte de tableau de bord « Ce soir on mange… »** : photo du plat, temps, portions, restes, et boutons Cuisiner / Voir la recette. À ajouter depuis Modifier le tableau de bord → Ajouter une carte.
- **Capteur `sensor.frigo_malin_prochain_repas`** : le prochain repas planifié, avec sa photo et ses détails, pour vos automatisations.
- Liens directs vers l'app (`/frigo-malin?tab=shopping`, `?recipe=…&cook=1`).

### Données

- Vos données sont converties automatiquement au démarrage pour accueillir les réglages du foyer.

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

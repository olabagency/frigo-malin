# Nouveautés de Frigo Malin

Toutes les évolutions notables sont listées ici. Les numéros de version suivent
[SemVer](https://semver.org/lang/fr/) :

- **correctif** (1.0.**1**) : corrections, rien ne change pour vous ;
- **mineure** (1.**1**.0) : nouvelles fonctions, vos recettes et réglages sont conservés ;
- **majeure** (**2**.0.0) : changement important, lisez les notes avant de mettre à jour.

## [1.10.0] – 2026-11-09

### Ajouté

- Accueil : **« Bonjour Adrien 👋 »**, avec le prénom de la personne connectée à Home Assistant.
- Accueil : **« Pas encore de repas »** liste les repas habituels encore libres dans les 7 prochains jours, avec un bouton pour les planifier avec l'IA d'un seul coup.

### Modifié

- Accueil : le raccourci **Ajout rapide** déplie la saisie directement sous les raccourcis, sans ouvrir de fenêtre ; elle se referme d'un appui à côté.
- Accueil : le prochain repas affiche aussi sa date (« Ce soir · lun. 9 nov. »).
- Planifier depuis l'accueil couvre les **7 prochains jours** à partir d'aujourd'hui (et non la semaine du lundi au dimanche), sans proposer le midi déjà passé.
- « Ajouter au menu » propose par défaut le **premier repas libre** au lieu d'aujourd'hui.
- Réglages : les thèmes se **déplient sur place, en accordéon** (un seul ouvert à la fois).

### Corrigé

- Ouvrir une fenêtre par-dessus une autre (thème des réglages, personne, magasin, mode cuisine…) ne fait plus apparaître l'accueil une demi-seconde.
- Planifier depuis l'accueil tient compte des repas déjà prévus, même si l'onglet Semaine n'a pas encore été ouvert.

## [1.9.0] – 2026-11-09

### Ajouté

- 🏠 **Page d'accueil** : nouvel onglet Accueil, sur lequel l'app s'ouvre.
  - Raccourcis : 📸 photo du frigo, ✨ planifier la semaine, ➕ ajouter aux courses, 📚 bibliothèque.
  - **Au menu** : le prochain repas (« Ce soir », « Demain midi »…) avec les boutons Cuisiner et La recette, puis les repas des jours suivants.
  - **Mon frigo** : les aliments à consommer vite et le bouton « Des idées avec ce qu'il me reste ».
  - **Courses** : le nombre d'articles restants, les premiers de la liste, et l'accès direct à la liste ou au magasin.

### Modifié

- **Réglages réorganisés** : un menu de six thèmes (Foyer, Repas et menus, Cuisine et goûts, Courses et magasins, Frigo, Intelligence artificielle), chacun avec un résumé de ce qui est réglé et sa propre page.
- Les réglages sont **enregistrés automatiquement** (« ✓ Enregistré » en haut de la page) : plus de bouton Enregistrer.

## [1.8.1] – 2026-11-09

### Modifié

- La barre latérale de Home Assistant affiche simplement **Frigo Malin** (l'en-tête de l'app et le nom de l'intégration gardent « par Adri »).

## [1.8.0] – 2026-11-09

### Ajouté

- 🧊 **Frigo qui se souvient** : la dernière photo du frigo est gardée en mémoire. L'onglet Frigo affiche ce qu'il reste, avec les aliments **à consommer vite** en premier, et le bouton « 💡 Des idées avec ce qu'il me reste » propose des recettes sans reprendre de photo.
  - L'IA estime combien de temps chaque aliment se garde ; la date se corrige d'un geste dans la liste (⏳ 2 j, ⚠️ demain…).
  - Les recettes proposées utilisent en priorité ce qui va se perdre.
  - Une nouvelle photo demande s'il faut **compléter** (frigo + placard) ou **remplacer** le contenu mémorisé.
  - À la fin du mode cuisine, les ingrédients utilisés sont retirés du frigo.
  - Réglages : durée de la mémoire (3 jours, 5 jours, 1 semaine, 2 semaines ou jusqu'à la prochaine photo) et bouton « Oublier le contenu du frigo ».
- 🤖 **Un modèle d'IA adapté à chaque tâche** (mode économique, activé par défaut) : un modèle rapide et peu cher pour lire une photo du frigo ou trouver des idées, un modèle intermédiaire pour importer une recette, et le plus puissant pour le menu de la semaine et les photos de livres. Les réglages affichent la **dépense estimée du mois**. Le mode « un seul modèle » reste disponible.
- 📅 **Menu de la semaine plus rapide** : l'IA propose d'abord le menu (titres et idées) en quelques secondes ; les recettes complètes ne sont écrites qu'à la validation, en parallèle.
  - **Remplacer un seul repas** du menu proposé sans tout relancer.
  - **Garder des repas** (cadenas) et relancer le reste.
- 🗓️ **Semaine** :
  - **Déplacer un repas** : appui long puis glisser vers un autre jour. Si la place est prise, les deux repas sont échangés.
  - **Reprendre un menu** d'une semaine passée : on choisit les repas à recopier, et leurs ingrédients sont ajoutés aux courses.

### Corrigé

- La recherche de recettes ignore les accents (« creme » trouve « crème »).
- Retirer un repas du menu propose aussi de retirer ses ingrédients de la liste de courses (sans toucher à ce qui sert à d'autres repas).
- Les releases GitHub sont créées automatiquement à chaque nouvelle version, pour que HACS propose la mise à jour.

## [1.7.1] – 2026-11-09

### Modifié

- Le **sel** et le **poivre** ne sont plus jamais ajoutés à la liste de courses depuis une recette, sous toutes leurs formes (fleur de sel, gros sel, poivre noir du moulin…), quel que soit le réglage des exclusions. On peut toujours les ajouter soi-même avec l'ajout rapide.

## [1.7.0] – 2026-11-09

### Ajouté

- **Minuteurs prévenus sur le téléphone** : quand un minuteur du mode cuisine se termine, Home Assistant envoie une notification « ⏰ C'est prêt ! » au téléphone de la personne qui l'a lancé, même écran verrouillé ou app fermée. Un appui rouvre la recette à la bonne étape.
- **Recette en cours conservée** : si l'iPhone se met en veille ou recharge l'app, le mode cuisine revient tel quel (étape, ingrédients cochés, minuteurs en cours) et l'écran est de nouveau maintenu allumé.

### Modifié

- L'app s'appelle maintenant **Frigo Malin par Adri** (barre latérale, en-tête, intégration, HACS, carte du tableau de bord).
- Onglet Courses : l'ajout rapide tient sur une ligne, avec une seule rangée de suggestions qui défile, et reste en haut pendant qu'on fait défiler la liste.
- Onglet Courses : les rayons suivent par défaut l'ordre du **premier magasin** créé (« Standard » reste disponible).

### Corrigé

- La liste de courses ne reçoit plus d'articles impossibles à acheter : « 2 tours de moulin de poivre au goût » devient « Poivre » (que les réglages excluent par défaut, comme le sel), « 3 gouttes de tabasco » devient « Tabasco », etc.
- Emoji erronés dans la liste : la quantité entre parenthèses n'est plus prise pour un aliment (« Moutarde (1 c. à café) » n'est plus du café ☕), et des câpres hachées ne sont plus de la viande.

## [1.6.0] – 2026-11-09

### Ajouté

- **Mode cuisine repensé** :
  - 🧺 **Mise en place** avant de commencer : portions, temps, nombre d'étapes, et la liste des ingrédients à cocher au fur et à mesure qu'on les sort.
  - Chaque étape s'affiche en grand avec un **emoji selon l'action** (🔪 couper, 🍳 faire revenir, ♨️ four, 🥄 mélanger, 🫕 mijoter, 💧 égoutter, 🌀 mixer, 🍽️ servir…).
  - Les **ingrédients utilisés dans l'étape** apparaissent sous le texte, avec leurs quantités pour le bon nombre de personnes.
  - **⏲️ Minuteur en un appui** quand l'étape indique une durée (« 20 minutes », « 5 à 8 min », « 1 h 30 ») : plusieurs minuteurs en même temps, +1 min, sonnerie et vibration à la fin.
  - Barre de progression : on touche une étape pour y aller directement.
  - Bouton **A+** pour agrandir le texte, à lire de loin.
  - Écran de fin 🎉 avec « Ajouter aux favoris » et « Revoir les étapes ».

### Corrigé

- Les messages ne passent plus par-dessus les boutons du bas des fenêtres.

## [1.5.0] – 2026-11-09

### Ajouté

- **Carnet de recettes** : glissez une recette vers la gauche pour la mettre en favori ⭐ ou la supprimer 🗑. La suppression demande confirmation, depuis la liste comme depuis la fiche recette.
- **Liste de courses** : toucher le texte d'un article permet de le modifier (Entrée ou toucher ailleurs pour enregistrer, Échap pour annuler). Seul le rond de gauche coche l'article dans le panier.

### Modifié

- L'en-tête et la barre d'onglets restent fixes : seul le contenu défile, même en tirant vers le haut ou le bas.
- La carte « Depuis le menu » quitte l'onglet Courses : les ingrédients s'ajoutent depuis la recette ou la planification.

### Corrigé

- L'icône « + » du bouton « Nouvelle » était écrasée.

## [1.4.1] – 2026-11-09

### Corrigé

- iPhone (app Home Assistant) : une bande vide apparaissait sous l'heure et la barre d'onglets du bas était coupée. Le panneau mesure maintenant la place réellement disponible sous la barre d'état.

## [1.4.0] – 2026-11-08

### Ajouté

- **Liste de courses intégrée** (`todo.frigo_malin_courses`) : Frigo Malin fonctionne sans l'intégration « Liste de courses » de Home Assistant. Elle est utilisée automatiquement si aucune autre liste n'est trouvée, et apparaît aussi dans l'onglet « À faire » de HA.
- **Choix de la liste de courses dans l'app** (⚙️ Réglages → Portions et liste de courses) : n'importe quelle liste de Home Assistant (Liste de courses, Bring!, Todoist…).
- **Nombre de personnes par défaut** (⚙️ Réglages) : « Auto » (calculé d'après le foyer) ou un nombre fixe, par exemple 2. Les recettes s'ouvrent directement à ce nombre de personnes, quantités recalculées, et les repas planifiés l'utilisent.

### Corrigé

- Planifier un repas affichait « Aucune liste de courses trouvée » quand l'intégration « Liste de courses » de HA n'était pas installée.
- Les quantités sous 1 kg ou 1 l s'affichent en g ou cl (« 500 g » plutôt que « ½ kg »).

### Données

- Vos données sont converties automatiquement au démarrage pour accueillir la liste de courses intégrée.

## [1.3.0] – 2026-11-08

### Ajouté

- **Bibliothèque de recettes saines** (onglet Recettes → 🌿 Bibliothèque) : 42 recettes équilibrées, anti-inflammatoires, de saison et gourmandes, du petit-déjeuner au dessert. Filtres par thème (anti-inflammatoire, équilibré, végétarien, vegan, sans gluten, rapide, protéiné, léger, petit budget, se garde bien), par type de repas et « de saison », recherche par ingrédient.
- Chaque recette explique **pourquoi c'est bon** (oméga-3, fibres, curcuma + poivre…) et s'ajoute au carnet en un appui.
- **Adaptée au foyer** : les recettes contenant un allergène d'une personne du foyer sont masquées, ou signalées si vous choisissez de les voir.
- **Encore plus d'idées** : l'IA invente de nouvelles recettes sur le thème choisi, de saison, adaptées au foyer et différentes de celles que vous avez déjà.

### Corrigé

- « 3 cm de gingembre » est maintenant lu correctement (le centimètre est reconnu comme unité).

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

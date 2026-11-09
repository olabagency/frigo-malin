"""Macronutriments estimés des recettes.

Une table d'aliments courants (valeurs moyennes pour 100 g, proches de la table Ciqual)
convertit chaque ingrédient en grammes puis en calories, protéines, glucides, lipides
et fibres. Les aliments absents de la table peuvent être complétés une fois par l'IA
(cache `foods` du stockage).

Ce module n'importe rien de Home Assistant : il est testable seul.
"""

from __future__ import annotations

import re
from typing import Any

from .parsing import _fold

MACROS = ("kcal", "protein", "carbs", "fat", "fiber")

# (mots-clés, kcal, protéines, glucides, lipides, fibres, extras)
# Extras : piece (g par pièce), density (g/ml), tbsp (g par c. à soupe), can (boîte), pot,
# pack (paquet / barquette), slice (tranche), roll (rouleau), sachet, leaf (feuille),
# default (g quand aucune quantité), neg (négligeable : épices, herbes, sel…).
_TABLE: list[tuple[tuple[str, ...], float, float, float, float, float, dict[str, Any]]] = [
    # --- légumes
    (("tomate",), 18, 0.9, 2.6, 0.2, 1.2, {"piece": 120}),
    (("tomate cerise",), 22, 0.9, 3, 0.3, 1.3, {"piece": 15, "pack": 250}),
    (("tomate concassee", "tomate pelee", "pulpe de tomate", "tomate en des"), 24, 1.2, 3.5, 0.3, 1.3, {"can": 400}),
    (("concentre de tomate", "double concentre"), 85, 4.3, 13, 0.5, 4, {"tbsp": 16, "can": 70}),
    (("coulis de tomate", "sauce tomate", "passata", "puree de tomate"), 35, 1.5, 6, 0.4, 1.5, {"can": 500, "density": 1.05}),
    (("tomate sechee",), 260, 14, 43, 3, 12, {"piece": 5}),
    (("courgette",), 16, 1.2, 2, 0.3, 1.1, {"piece": 200}),
    (("aubergine",), 21, 1, 3, 0.2, 2.5, {"piece": 300}),
    (("poivron",), 26, 1, 4.5, 0.3, 1.9, {"piece": 160}),
    (("oignon",), 40, 1.1, 7.6, 0.1, 1.7, {"piece": 120}),
    (("oignon nouveau", "oignon vert", "cebette", "ciboule"), 30, 1.8, 5, 0.2, 2.6, {"piece": 20}),
    (("oignon rouge",), 40, 1.1, 7.6, 0.1, 1.7, {"piece": 120}),
    (("echalote",), 72, 2.5, 15, 0.1, 3.2, {"piece": 30}),
    (("ail",), 130, 6.4, 24, 0.5, 2.1, {"piece": 5, "default": 3}),
    (("carotte",), 36, 0.8, 7.6, 0.3, 2.7, {"piece": 100}),
    (("pomme de terre", "patate", "grenaille"), 80, 2, 16, 0.1, 1.8, {"piece": 150}),
    (("patate douce",), 86, 1.6, 18, 0.1, 3, {"piece": 250}),
    (("poireau",), 30, 1.5, 5, 0.3, 2.3, {"piece": 200}),
    (("champignon", "champignon de pari", "shiitake", "pleurote", "girolle", "cepe"), 22, 3.1, 1, 0.3, 1.5, {"piece": 20, "pack": 250}),
    (("epinard", "pousse d epinard"), 23, 2.9, 1.2, 0.4, 2.2, {"pack": 200}),
    (("pois gourmand", "mange tout"), 42, 2.8, 7.5, 0.2, 2.6, {}),
    (("algue", "algue nori", "nori", "wakame"), 35, 5, 5, 0.3, 4, {"leaf": 3, "piece": 3, "default": 3}),
    (("salade", "jeune pousse", "laitue", "roquette", "mache", "mesclun", "batavia", "sucrine", "frisee", "cresson"), 15, 1.3, 1.5, 0.2, 1.5, {"piece": 250, "pack": 125}),
    (("concombre",), 13, 0.6, 2, 0.1, 0.7, {"piece": 300}),
    (("brocoli",), 34, 2.8, 4, 0.4, 2.6, {"piece": 400}),
    (("chou fleur",), 25, 2, 3, 0.3, 2.2, {"piece": 800}),
    (("chou", "chou vert", "chou blanc", "chou rouge", "chou chinoi", "pak choi"), 27, 1.3, 4.5, 0.2, 2.5, {"piece": 1000}),
    (("chou de bruxelle",), 43, 3.4, 5, 0.3, 3.8, {"piece": 15}),
    (("chou kale", "kale"), 49, 4.3, 5, 0.9, 4, {"pack": 200}),
    (("haricot vert",), 30, 1.8, 4.6, 0.2, 3.3, {}),
    (("petit poi", "petits poi"), 80, 5.4, 11, 0.4, 5.5, {"can": 280}),
    (("mai",), 100, 3.2, 19, 1.2, 2.7, {"can": 285}),
    (("butternut", "courge", "potiron", "potimarron", "citrouille"), 40, 1, 8, 0.1, 2, {"piece": 1200}),
    (("celeri", "celeri branche"), 15, 0.7, 2, 0.2, 1.6, {"piece": 40}),
    (("celeri rave",), 30, 1.5, 4.3, 0.3, 4.9, {"piece": 600}),
    (("fenouil",), 31, 1.2, 5, 0.2, 3.1, {"piece": 250}),
    (("betterave",), 43, 1.6, 8, 0.1, 2.8, {"piece": 150}),
    (("radi",), 16, 0.7, 2, 0.1, 1.6, {"piece": 10, "bunch": 200}),
    (("navet",), 28, 0.9, 5, 0.1, 1.8, {"piece": 120}),
    (("panai",), 75, 1.2, 15, 0.3, 4.9, {"piece": 150}),
    (("artichaut",), 47, 3.3, 7, 0.2, 5.4, {"piece": 250}),
    (("asperge",), 20, 2.2, 2, 0.1, 2.1, {"piece": 20, "bunch": 500}),
    (("avocat",), 160, 2, 1.9, 15, 6.7, {"piece": 140}),
    (("gingembre",), 80, 1.8, 15, 0.8, 2, {"piece": 20, "default": 3}),
    (("piment",), 40, 1.9, 8, 0.4, 1.5, {"piece": 10, "default": 2}),
    (("olive",), 145, 1, 1, 15, 3.3, {"piece": 4}),
    (("cornichon",), 15, 0.5, 2, 0.2, 1, {"piece": 10}),
    (("capre",), 23, 2.4, 2, 0.9, 3.2, {"tbsp": 9}),
    (("endive",), 17, 1, 2.5, 0.1, 1, {"piece": 120}),
    (("pousse de soja", "germe de soja"), 30, 3, 4, 0.2, 1.8, {}),
    (("edamame", "feve de soja"), 120, 11, 9, 5, 5, {}),
    (("feve",), 70, 5.6, 8, 0.4, 5, {}),
    # --- légumineuses
    (("pois chiche",), 120, 7, 16, 2.4, 6, {"can": 265}),
    (("lentille", "lentille corail", "lentille verte"), 320, 24, 48, 1.5, 11, {}),
    (("haricot rouge", "haricot noir"), 110, 8, 15, 0.5, 6.5, {"can": 250}),
    (("haricot blanc", "flageolet", "lingot"), 105, 7, 15, 0.5, 6, {"can": 250}),
    (("tofu",), 125, 13, 2, 7.5, 1, {"pack": 200}),
    (("tofu soyeux",), 55, 5, 2, 2.7, 0.3, {"pack": 300}),
    (("tempeh",), 190, 19, 9, 11, 5, {"pack": 200}),
    (("houmou", "hummu"), 300, 8, 13, 24, 6, {"pot": 200, "tbsp": 15}),
    # --- fruits
    (("pomme",), 52, 0.3, 12, 0.2, 2.2, {"piece": 150}),
    (("poire",), 55, 0.4, 12, 0.1, 3, {"piece": 160}),
    (("banane",), 90, 1.1, 20, 0.3, 2.6, {"piece": 120}),
    (("citron", "citron vert", "citron jaune"), 30, 1, 5, 0.3, 2.8, {"piece": 50, "default": 15}),
    (("jus de citron", "jus d un citron", "jus de citron vert"), 22, 0.4, 2.4, 0.1, 0, {"density": 1, "tbsp": 15, "piece": 40, "filet": 5}),
    (("orange",), 45, 0.9, 9, 0.1, 2, {"piece": 180}),
    (("jus d orange",), 45, 0.7, 10, 0.1, 0.2, {"density": 1.04}),
    (("pamplemousse",), 38, 0.7, 7.5, 0.1, 1.5, {"piece": 300}),
    (("clementine", "mandarine"), 45, 0.8, 9, 0.2, 1.8, {"piece": 70}),
    (("fraise",), 32, 0.7, 6, 0.3, 2, {"piece": 15, "pack": 250}),
    (("framboise",), 50, 1.2, 5, 0.6, 6.5, {"pack": 125}),
    (("myrtille",), 57, 0.7, 12, 0.3, 2.4, {"pack": 125}),
    (("fruits rouge", "fruit rouge", "mure", "cassis", "groseille"), 45, 1, 8, 0.4, 4, {"pack": 250}),
    (("mangue",), 65, 0.7, 14, 0.4, 1.6, {"piece": 300}),
    (("ananas",), 50, 0.5, 11, 0.1, 1.4, {"piece": 900}),
    (("peche", "nectarine", "brugnon"), 42, 0.9, 9, 0.2, 1.7, {"piece": 130}),
    (("abricot",), 45, 0.9, 9, 0.2, 2, {"piece": 45}),
    (("prune", "mirabelle", "quetsche"), 50, 0.7, 11, 0.3, 1.6, {"piece": 30}),
    (("raisin",), 70, 0.6, 16, 0.2, 0.9, {}),
    (("raisin sec",), 300, 3, 70, 0.5, 4, {"tbsp": 12}),
    (("kiwi",), 60, 1.1, 11, 0.5, 3, {"piece": 75}),
    (("cerise",), 60, 1, 13, 0.3, 1.6, {"piece": 7}),
    (("figue",), 70, 0.8, 16, 0.3, 2.5, {"piece": 50}),
    (("grenade",), 80, 1.7, 15, 1.2, 4, {"piece": 250}),
    (("melon",), 35, 0.8, 7.5, 0.2, 0.9, {"piece": 800}),
    (("pasteque",), 30, 0.6, 7, 0.2, 0.4, {"piece": 3000}),
    (("datte",), 280, 2.5, 66, 0.4, 7, {"piece": 8}),
    (("abricot sec", "pruneau", "figue seche"), 250, 2.5, 55, 0.5, 7, {"piece": 8}),
    (("noix de coco rapee", "coco rapee", "noix de coco"), 660, 6.5, 6, 64, 16, {"tbsp": 6}),
    (("lait de coco",), 190, 1.9, 3, 19, 0.5, {"density": 1, "can": 400}),
    (("creme de coco",), 280, 2.5, 4, 28, 1, {"density": 1, "can": 200}),
    # --- féculents
    (("pate", "spaghetti", "penne", "tagliatelle", "fusilli", "coquillette", "macaroni", "linguine",
      "farfalle", "rigatoni", "conchiglie", "orecchiette", "nouille", "vermicelle", "pate seche"), 355, 12.5, 70, 1.5, 3, {"pack": 500}),
    (("lasagne", "feuille de lasagne"), 355, 12.5, 70, 1.5, 3, {"piece": 20, "leaf": 20, "pack": 500}),
    (("pate fraiche", "tagliatelle fraiche", "ravioli", "tortellini"), 280, 11, 50, 3.5, 2.5, {"pack": 250}),
    (("gnocchi",), 150, 3.5, 32, 0.4, 2, {"pack": 500}),
    (("nouille de riz", "vermicelle de riz"), 360, 6, 80, 0.6, 1.6, {"pack": 250}),
    (("riz", "riz basmati", "riz thai", "riz complet", "riz arborio", "riz rond"), 350, 7, 77, 0.6, 1.4, {}),
    (("quinoa",), 360, 14, 60, 6, 7, {}),
    (("boulgour",), 350, 12, 70, 1.5, 9, {}),
    (("semoule", "couscou"), 360, 12.5, 72, 1.5, 4, {}),
    (("sarrasin", "kasha"), 345, 13, 68, 3.4, 10, {}),
    (("millet", "epeautre", "orge", "petit epeautre", "polenta"), 350, 10, 70, 2.5, 6, {}),
    (("flocon d avoine", "avoine", "muesli"), 370, 13, 60, 7, 10, {"tbsp": 8}),
    (("farine", "farine de ble", "farine t", "farine complete"), 345, 10, 72, 1.2, 3.5, {"tbsp": 10}),
    (("farine de sarrasin", "farine de pois chiche", "farine de riz"), 350, 12, 70, 2, 6, {"tbsp": 10}),
    (("poudre d amande", "amande en poudre"), 600, 21, 7, 52, 12, {"tbsp": 8}),
    (("maizena", "fecule", "fecule de mai"), 350, 0.3, 86, 0.1, 1, {"tbsp": 8}),
    (("pain", "baguette", "pain de campagne"), 270, 9, 53, 1.5, 3.5, {"slice": 35, "piece": 250}),
    (("pain de mie",), 270, 8, 48, 4, 3, {"slice": 25, "piece": 25}),
    (("pain complet", "pain aux cereale", "pain de seigle"), 245, 9, 42, 2.5, 7, {"slice": 35, "piece": 400}),
    (("pain burger", "pain hamburger", "bun", "pain a burger"), 280, 9, 50, 5, 2.5, {"piece": 60}),
    (("tortilla", "wrap", "galette de ble"), 300, 8, 50, 7, 3, {"piece": 60}),
    (("pain pita", "pita", "naan"), 275, 9, 55, 1.2, 2.2, {"piece": 60}),
    (("chapelure", "panko"), 380, 12, 72, 4, 4, {"tbsp": 8}),
    (("biscotte",), 410, 11, 72, 7, 4, {"piece": 9}),
    (("pate feuilletee",), 400, 5.5, 37, 25, 1.5, {"roll": 230, "piece": 230}),
    (("pate brisee",), 420, 6, 45, 24, 2, {"roll": 230, "piece": 230}),
    (("pate sablee",), 470, 6, 55, 25, 2, {"roll": 230, "piece": 230}),
    (("pate a pizza",), 260, 7, 48, 4, 2, {"roll": 260, "piece": 260}),
    (("feuille de brick", "brick", "pate filo", "feuille de filo"), 300, 8, 60, 2, 2, {"leaf": 10, "piece": 10}),
    (("galette de sarrasin", "galette bretonne"), 200, 6, 40, 1.5, 3, {"piece": 60}),
    (("crepe",), 200, 6, 28, 7, 1, {"piece": 50}),
    (("biscuit", "speculoo", "boudoir", "biscuit sec", "petit beurre"), 450, 7, 72, 15, 2, {"piece": 8}),
    # --- produits laitiers et œufs
    (("lait", "lait demi ecreme"), 46, 3.3, 4.8, 1.6, 0, {"density": 1.03}),
    (("lait entier",), 64, 3.3, 4.7, 3.6, 0, {"density": 1.03}),
    (("lait ecreme",), 34, 3.4, 4.9, 0.1, 0, {"density": 1.03}),
    (("lait d amande",), 25, 0.6, 3, 1.2, 0.3, {"density": 1}),
    (("lait d avoine", "boisson vegetale", "boisson a l avoine"), 45, 1, 7, 1.5, 0.8, {"density": 1}),
    (("lait de soja", "boisson au soja"), 40, 3.5, 2, 2, 0.5, {"density": 1}),
    (("lait concentre",), 320, 8, 55, 8, 0, {"density": 1.3, "can": 397}),
    (("creme", "creme fraiche", "creme epaisse", "creme liquide", "creme entiere", "creme fleurette", "creme fraiche epaisse"),
     290, 2.3, 3, 30, 0, {"density": 1, "pot": 200, "tbsp": 15}),
    (("creme legere", "creme fraiche legere", "creme liquide legere", "creme a 15", "creme fraiche a 15", "creme liquide a 15", "creme semi epaisse"), 160, 3, 4, 15, 0, {"density": 1, "pot": 200, "tbsp": 15}),
    (("creme de soja", "creme vegetale", "creme d avoine"), 160, 2.5, 5, 15, 0.5, {"density": 1, "pot": 200}),
    (("beurre", "beurre doux", "beurre demi sel"), 745, 0.7, 0.6, 82, 0, {"tbsp": 15}),
    (("yaourt", "yogourt", "yaourt nature"), 60, 4, 5, 3, 0, {"piece": 125, "pot": 125}),
    (("yaourt grec", "yaourt a la grecque"), 120, 5, 4, 10, 0, {"piece": 150, "pot": 150}),
    (("skyr",), 63, 11, 4, 0.2, 0, {"pot": 150}),
    (("fromage blanc", "faisselle", "petit suisse"), 75, 7.5, 4, 3, 0, {"pot": 250, "piece": 60}),
    (("oeuf",), 140, 12.5, 0.7, 9.5, 0, {"piece": 55}),
    (("jaune d oeuf",), 330, 16, 0.6, 29, 0, {"piece": 18}),
    (("blanc d oeuf",), 48, 10.5, 0.7, 0.2, 0, {"piece": 33}),
    (("emmental", "gruyere", "comte", "beaufort", "fromage rape"), 390, 28, 0.5, 30, 0, {"tbsp": 7, "default": 20}),
    (("parmesan", "parmigiano", "grana padano", "pecorino"), 400, 35, 0, 28, 0, {"tbsp": 6, "default": 10}),
    (("mozzarella",), 250, 18, 1.5, 19, 0, {"piece": 125}),
    (("burrata",), 230, 15, 1, 19, 0, {"piece": 125}),
    (("feta",), 265, 14, 1, 22, 0, {"pack": 200}),
    (("chevre", "buche de chevre", "fromage de chevre"), 300, 18, 1, 25, 0, {"piece": 100}),
    (("chevre frai", "fromage frai", "philadelphia", "saint moret", "carre frai", "boursin", "cream cheese"), 250, 6, 3, 24, 0, {"pack": 150, "tbsp": 15}),
    (("ricotta",), 150, 9, 3, 11, 0, {"pot": 250}),
    (("mascarpone",), 430, 4.8, 4, 44, 0, {"pot": 250, "tbsp": 15}),
    (("cheddar",), 400, 25, 1.3, 33, 0, {"slice": 20}),
    (("roquefort", "bleu", "gorgonzola", "fourme"), 360, 20, 0.5, 31, 0, {}),
    (("camembert", "brie", "coulommier"), 300, 20, 0.5, 24, 0, {"piece": 250}),
    (("reblochon", "raclette", "morbier", "tomme", "cantal", "saint nectaire"), 340, 23, 0.5, 27, 0, {"slice": 30, "piece": 450}),
    # --- viandes et poissons (crus)
    (("poulet", "blanc de poulet", "filet de poulet", "escalope de poulet", "aiguillette de poulet"), 110, 23, 0, 2, 0, {"piece": 150}),
    (("cuisse de poulet", "haut de cuisse", "pilon"), 190, 18, 0, 13, 0, {"piece": 180}),
    (("poulet entier",), 190, 19, 0, 13, 0, {"piece": 1300}),
    (("dinde", "escalope de dinde"), 105, 23, 0, 1.5, 0, {"piece": 130}),
    (("boeuf", "steak", "bavette", "rumsteck", "entrecote", "faux filet", "onglet", "filet de boeuf", "rosbif"), 150, 22, 0, 6, 0, {"piece": 150}),
    (("boeuf hache", "viande hachee", "steak hache"), 215, 18, 0, 15, 0, {"piece": 100}),
    (("boeuf a braiser", "paleron", "joue de boeuf", "boeuf bourguignon", "macreuse", "gite"), 170, 20, 0, 10, 0, {}),
    (("veau", "escalope de veau", "blanquette"), 130, 21, 0, 5, 0, {"piece": 150}),
    (("porc", "filet mignon", "echine", "cote de porc", "roti de porc", "travers"), 180, 20, 0, 11, 0, {"piece": 180}),
    (("lardon",), 270, 15, 1, 23, 0, {"pack": 200}),
    (("bacon", "poitrine fumee", "pancetta"), 250, 16, 1, 20, 0, {"slice": 15}),
    (("jambon", "jambon blanc", "jambon cuit"), 115, 20, 1, 3.5, 0, {"slice": 40}),
    (("jambon cru", "jambon de parme", "jambon de bayonne", "prosciutto", "speck"), 250, 26, 0.5, 16, 0, {"slice": 15}),
    (("chorizo",), 450, 24, 2, 38, 0, {"slice": 5, "piece": 200}),
    (("saucisse", "chipolata", "saucisse de toulouse", "knack", "saucisse de strasbourg"), 280, 14, 1, 25, 0, {"piece": 100}),
    (("merguez",), 300, 15, 1, 26, 0, {"piece": 70}),
    (("saucisson",), 410, 26, 2, 33, 0, {"slice": 5}),
    (("agneau", "gigot", "epaule d agneau", "cote d agneau", "souris d agneau"), 230, 18, 0, 17, 0, {"piece": 120}),
    (("canard", "magret", "magret de canard"), 200, 20, 0, 13, 0, {"piece": 350}),
    (("lapin",), 140, 21, 0, 6, 0, {"piece": 200}),
    (("foie de volaille",), 120, 17, 1, 5, 0, {}),
    (("saumon", "pave de saumon"), 200, 20, 0, 13, 0, {"piece": 130}),
    (("saumon fume", "truite fumee"), 180, 23, 0, 10, 0, {"slice": 25}),
    (("cabillaud", "colin", "merlu", "lieu", "eglefin", "poisson blanc", "dos de cabillaud", "julienne", "sole", "limande", "tilapia", "pangasiu"),
     80, 18, 0, 0.7, 0, {"piece": 130}),
    (("thon",), 130, 25, 0, 3, 0, {"piece": 130, "can": 140}),
    (("thon en boite", "thon au naturel"), 115, 26, 0, 1, 0, {"can": 140}),
    (("sardine",), 210, 24, 0, 12, 0, {"can": 100, "piece": 25, "filet": 12}),
    (("maquereau",), 200, 19, 0, 14, 0, {"piece": 150, "filet": 80, "can": 120}),
    (("truite", "dorade", "bar", "loup", "rouget"), 120, 20, 0, 4.5, 0, {"piece": 150}),
    (("crevette", "gambas", "scampi"), 90, 20, 0, 1, 0, {"piece": 12}),
    (("moule",), 85, 12, 4, 2, 0, {}),
    (("saint jacque", "noix de saint jacque", "coquille saint jacque"), 80, 15, 3, 0.5, 0, {"piece": 25}),
    (("calamar", "encornet", "seiche", "poulpe"), 80, 16, 1, 1.2, 0, {}),
    (("surimi",), 105, 8, 15, 1, 0, {"piece": 15}),
    (("anchoi",), 190, 25, 0, 10, 0, {"piece": 4}),
    # --- matières grasses et condiments
    (("huile", "huile d olive", "huile de tournesol", "huile de colza", "huile de sesame", "huile neutre", "huile de coco", "huile de pepin de raisin"),
     900, 0, 0, 100, 0, {"density": 0.92, "tbsp": 13.5, "filet": 5, "default": 5}),
    (("vinaigre", "vinaigre de vin", "vinaigre de cidre", "vinaigre de riz", "vinaigre de xere"), 20, 0, 0.5, 0, 0, {"density": 1, "tbsp": 15, "filet": 5, "default": 5}),
    (("vinaigre balsamique", "balsamique", "creme de balsamique"), 90, 0.5, 17, 0, 0, {"density": 1.2, "tbsp": 17, "filet": 5, "default": 5}),
    (("moutarde",), 150, 7, 5, 11, 3, {"tbsp": 15, "default": 5}),
    (("mayonnaise",), 700, 1.5, 2, 75, 0, {"tbsp": 15}),
    (("ketchup",), 110, 1.5, 25, 0.2, 0.5, {"tbsp": 17}),
    (("sauce soja", "soja sucre", "tamari", "shoyu"), 55, 8, 5, 0.5, 0.8, {"density": 1.15, "tbsp": 16, "filet": 5, "default": 10}),
    (("nuoc mam", "sauce poisson", "sauce nuoc mam"), 35, 5, 3.6, 0, 0, {"density": 1.2, "tbsp": 18, "default": 5}),
    (("sauce worcestershire", "tabasco", "sauce piquante", "sriracha"), 80, 1, 18, 0, 0, {"density": 1.1, "tbsp": 16, "default": 2}),
    (("pesto",), 450, 5, 6, 45, 2, {"tbsp": 15, "pot": 190}),
    (("pate de curry", "curry paste"), 120, 3, 12, 6, 4, {"tbsp": 15}),
    (("tahini", "puree de sesame", "creme de sesame"), 640, 17, 10, 57, 9, {"tbsp": 15}),
    (("beurre de cacahuete", "puree de cacahuete", "puree d amande", "beurre d amande"), 600, 25, 15, 50, 6, {"tbsp": 16}),
    (("miel",), 320, 0.4, 80, 0, 0, {"tbsp": 20, "density": 1.4}),
    (("sirop d erable", "sirop d agave", "sirop"), 260, 0, 67, 0.1, 0, {"tbsp": 20, "density": 1.3}),
    (("sucre", "sucre en poudre", "sucre roux", "cassonade", "sucre de canne", "vergeoise", "sucre complet"), 400, 0, 100, 0, 0, {"tbsp": 12}),
    (("sucre glace",), 400, 0, 100, 0, 0, {"tbsp": 8}),
    (("sucre vanille",), 400, 0, 100, 0, 0, {"sachet": 7.5}),
    (("chocolat", "chocolat noir", "chocolat patissier", "pepite de chocolat", "chocolat a cuire"), 550, 7, 35, 40, 10, {"piece": 10, "pack": 200}),
    (("chocolat au lait",), 540, 7, 57, 31, 2, {"piece": 10, "pack": 100}),
    (("chocolat blanc",), 560, 6, 58, 34, 0, {"piece": 10, "pack": 100}),
    (("cacao", "cacao en poudre", "cacao non sucre"), 380, 20, 15, 22, 30, {"tbsp": 6}),
    (("pate a tartiner", "nutella"), 540, 6, 57, 31, 3, {"tbsp": 18}),
    (("confiture",), 250, 0.4, 60, 0.1, 1, {"tbsp": 20}),
    (("compote", "compote de pomme"), 70, 0.3, 16, 0.1, 1.5, {"pot": 100}),
    (("gelatine", "agar agar"), 350, 85, 0, 0, 0, {"leaf": 2, "sachet": 9, "default": 2}),
    (("levure", "levure chimique", "poudre a lever", "bicarbonate"), 50, 0, 25, 0, 0, {"sachet": 11, "default": 5}),
    (("levure boulangere", "levure de boulanger"), 100, 40, 10, 2, 7, {"sachet": 5.5, "cube": 42}),
    (("bouillon", "fond de volaille", "fond de veau", "bouillon de volaille", "bouillon de legume", "bouillon de boeuf", "court bouillon"),
     6, 0.5, 0.5, 0.2, 0, {"density": 1, "cube": 10, "tbsp": 15, "default": 10}),
    (("vin", "vin blanc", "vin rouge", "porto", "cidre", "biere", "cognac", "rhum", "marsala"), 80, 0.1, 2.5, 0, 0, {"density": 1, "default": 10}),
    (("graine de sesame", "sesame"), 570, 18, 12, 50, 12, {"tbsp": 9, "default": 3}),
    (("graine de chia", "chia"), 490, 17, 8, 31, 34, {"tbsp": 12}),
    (("graine de lin", "lin"), 530, 18, 2, 42, 27, {"tbsp": 10}),
    (("graine de courge", "graine de potiron"), 570, 30, 5, 49, 6, {"tbsp": 10}),
    (("graine de tournesol",), 600, 21, 11, 51, 9, {"tbsp": 10}),
    (("amande", "amande effilee"), 600, 21, 7, 52, 12, {"piece": 1.2, "tbsp": 8}),
    (("noix", "cerneau de noix", "noix de grenoble"), 690, 15, 7, 65, 6.5, {"piece": 5, "tbsp": 8}),
    (("noisette",), 650, 15, 7, 61, 10, {"piece": 1.5, "tbsp": 8}),
    (("noix de cajou", "cajou"), 580, 18, 27, 46, 3, {"piece": 1.5, "tbsp": 9}),
    (("pistache",), 590, 20, 18, 46, 10, {"piece": 0.7, "tbsp": 9}),
    (("cacahuete", "arachide"), 590, 25, 10, 50, 8.5, {"piece": 0.8, "tbsp": 9}),
    (("pignon", "pignon de pin"), 670, 14, 4, 68, 3.7, {"tbsp": 9}),
    (("noix de pecan", "noix du bresil", "macadamia"), 700, 9, 6, 72, 8, {"piece": 4}),
    # --- négligeables : herbes, épices, sel, eau
    (("sel", "fleur de sel", "gros sel", "poivre", "poivre noir", "baie rose", "eau", "glacon", "eau chaude", "eau froide",
      "thym", "romarin", "laurier", "persil", "coriandre", "basilic", "ciboulette", "menthe", "aneth", "estragon", "origan", "sauge",
      "cerfeuil", "herbe", "herbes de provence", "fine herbe", "cumin", "curry", "paprika", "cannelle", "curcuma", "muscade", "noix de muscade",
      "piment d espelette", "piment de cayenne", "ras el hanout", "quatre epice", "safran", "cardamome", "clou de girofle", "zaatar",
      "gingembre en poudre", "ail en poudre", "oignon en poudre", "epice", "badiane", "anis etoile", "fenugrec", "garam masala",
      "vanille", "gousse de vanille", "extrait de vanille", "arome", "colorant", "graine de fenouil", "graine de moutarde", "sumac",
      "fleur d oranger", "eau de fleur d oranger", "zeste", "zeste de citron", "zeste d orange", "citronnelle", "feuille de kaffir",
      "bouquet garni", "cinq epice", "piment en poudre", "chili", "harissa", "wasabi"),
     0, 0, 0, 0, 0, {"neg": True}),
]


def _build_index() -> list[tuple[str, int]]:
    index = []
    for i, entry in enumerate(_TABLE):
        for word in entry[0]:
            index.append((f" {_fold(word)} ", i))
    # Le mot-clé le plus long l'emporte (« pomme de terre » avant « pomme »).
    index.sort(key=lambda x: len(x[0]), reverse=True)
    return index


_INDEX = _build_index()


def food_key(name: str) -> str:
    return _fold(name).strip()


# Ce qui suit « à », « au », « aux », « en », « avec »… décrit l'aliment sans être l'aliment
# (« sardines à l'huile d'olive » sont des sardines, pas de l'huile).
_HEAD_END = re.compile(r" (?:a|au|aux|en|avec|pour|facon|sauce) ")


def match_food(name: str) -> dict[str, Any] | None:
    """Aliment de la table qui correspond au nom d'un ingrédient (ou None)."""
    folded = f" {_fold(name)} "
    cut = _HEAD_END.search(folded)
    head_end = cut.start() if cut else len(folded)
    found = None
    for word, i in _INDEX:
        pos = folded.find(word)
        if pos < 0:
            continue
        if pos < head_end:
            found = i
            break
        if found is None:
            found = i
    if found is None:
        return None
    words, kcal, protein, carbs, fat, fiber, extra = _TABLE[found]
    return {"kcal": kcal, "protein": protein, "carbs": carbs, "fat": fat, "fiber": fiber, **extra}


def _cached(name: str, foods: dict[str, Any] | None) -> dict[str, Any] | None:
    if not foods:
        return None
    food = foods.get(food_key(name))
    return food if food and not food.get("skip") else None


def grams(quantity: float | None, unit: str, food: dict[str, Any]) -> float:
    """Poids approximatif d'un ingrédient en grammes."""
    unit = (unit or "").strip().lower()
    if food.get("neg"):
        return 0.0
    if quantity is None:
        return float(food.get("default", 10))
    q = float(quantity)
    dens = float(food.get("density", 1))
    tbsp = float(food.get("tbsp", 15 * dens))
    piece = float(food.get("piece", 100))
    table = {
        "g": q,
        "kg": q * 1000,
        "mg": q / 1000,
        "ml": q * dens,
        "cl": q * 10 * dens,
        "dl": q * 100 * dens,
        "l": q * 1000 * dens,
        "c. à soupe": q * tbsp,
        "c. à café": q * tbsp / 3,
        "pincée": q * 0.4,
        "gousse": q * 5,
        "cm": q * 5,
        "noix": q * 10,
        "noisette": q * 5,
        "verre": q * 200 * dens,
        "tasse": q * 240 * dens,
        "bol": q * 300 * dens,
        "filet": q * food.get("filet", piece if "piece" in food else 5),
        "zeste": q * 2,
        "trait": q * 5,
        "feuille": q * food.get("leaf", 2),
        "brin": q * 1,
        "branche": q * food.get("piece", 2),
        "bouquet": q * 20,
        "botte": q * food.get("bunch", 150),
        "poignée": q * 30,
        "sachet": q * food.get("sachet", 10),
        "boîte": q * food.get("can", 400),
        "pot": q * food.get("pot", 125),
        "paquet": q * food.get("pack", 250),
        "barquette": q * food.get("pack", 250),
        "rouleau": q * food.get("roll", 230),
        "tranche": q * food.get("slice", 30),
        "morceau": q * food.get("chunk", 30),
        "cube": q * food.get("cube", 10),
    }
    return float(table.get(unit, q * piece))


def compute(
    ingredients: list[dict[str, Any]], servings: int | None, foods: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Macronutriments par portion d'une recette.

    Renvoie {"kcal", "protein", "carbs", "fat", "fiber", "unknown": [noms], "ai": bool}.
    Les ingrédients inconnus ne sont pas comptés (ils sont listés dans `unknown`).
    """
    totals = dict.fromkeys(MACROS, 0.0)
    unknown: list[str] = []
    lines: list[tuple[str, float, float]] = []
    used_ai = False
    for ing in ingredients or []:
        name = str(ing.get("name") or "").strip()
        if not name:
            continue
        food = match_food(name)
        if food is None:
            food = _cached(name, foods)
            used_ai = used_ai or food is not None
        if food is None:
            unknown.append(name)
            continue
        weight = grams(ing.get("quantity"), ing.get("unit") or "", food)
        for key in MACROS:
            totals[key] += float(food.get(key, 0)) * weight / 100
        if weight:
            lines.append((name, weight, float(food.get("kcal", 0)) * weight / 100))
    portions = max(1, int(servings or 4))
    per = {key: value / portions for key, value in totals.items()}
    return {
        "kcal": round(per["kcal"]),
        "protein": _round(per["protein"]),
        "carbs": _round(per["carbs"]),
        "fat": _round(per["fat"]),
        "fiber": _round(per["fiber"]),
        "unknown": unknown,
        "ai": used_ai,
        # Détail par portion, du plus calorique au moins calorique : pour vérifier le calcul.
        "details": [
            {"name": n, "grams": round(g / portions), "kcal": round(k / portions)}
            for n, g, k in sorted(lines, key=lambda x: -x[2])
        ],
    }


def _round(value: float) -> float:
    return round(value, 1) if value < 10 else float(round(value))


def with_nutrition(recipe: dict[str, Any], foods: dict[str, Any] | None = None) -> dict[str, Any]:
    """Copie de la recette avec ses macronutriments par portion."""
    return {**recipe, "nutrition": compute(recipe.get("ingredients") or [], recipe.get("servings"), foods)}


def unknown_names(recipes: list[dict[str, Any]], foods: dict[str, Any] | None = None) -> list[str]:
    """Ingrédients sans valeurs nutritionnelles connues, sans doublon."""
    seen: dict[str, str] = {}
    for recipe in recipes:
        for ing in recipe.get("ingredients") or []:
            name = str(ing.get("name") or "").strip()
            if not name or match_food(name) or (foods and food_key(name) in foods):
                continue
            seen.setdefault(food_key(name), name)
    return list(seen.values())


def clean_food(raw: dict[str, Any]) -> dict[str, Any]:
    """Valeurs données par l'IA pour 100 g, bornées."""

    def num(key: str, high: float) -> float:
        try:
            return max(0.0, min(high, float(raw.get(key) or 0)))
        except (TypeError, ValueError):
            return 0.0

    food = {
        "kcal": num("kcal", 900),
        "protein": num("protein", 100),
        "carbs": num("carbs", 100),
        "fat": num("fat", 100),
        "fiber": num("fiber", 100),
    }
    piece = num("piece_g", 5000)
    if piece:
        food["piece"] = piece
    if raw.get("negligible"):
        food["neg"] = True
    return food

"""Place réservée aux connecteurs de « drive » (commande de courses en ligne).

La V1 n'en active aucun. Le premier prévu est Leclerc Drive, via le connecteur
de skunkobi qui tourne sur un Mac ou un PC allumé et expose une petite API
locale. Pour l'ajouter, il suffira de créer une sous-classe de DriveConnector
(par exemple `leclerc.py`) et de l'enregistrer dans CONNECTORS.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DriveItem:
    """Un article à mettre dans le panier du drive."""

    name: str
    quantity: float | None = None
    unit: str = ""


class DriveConnector:
    """Interface commune à tous les drives."""

    key = "none"
    name = "Aucun"

    async def async_test(self) -> bool:
        """Vérifie que le drive est joignable."""
        return False

    async def async_add_to_cart(self, items: list[DriveItem]) -> list[str]:
        """Ajoute les articles au panier. Renvoie ceux qui n'ont pas été trouvés."""
        raise NotImplementedError


# Connecteurs disponibles, par clé. Vide pour la V1.
CONNECTORS: dict[str, type[DriveConnector]] = {}

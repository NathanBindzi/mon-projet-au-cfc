"""
Manager WebSocket - Gère les connexions en temps réel
Notifie les clients des mises à jour de factures et des alertes.
"""

import logging
from typing import Set
from fastapi import WebSocket

logger = logging.getLogger("websocket_manager")


class WebSocketManager:
    """Gère les connexions WebSocket et les broadcasts"""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        """Accepte une nouvelle connexion WebSocket."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"✅ Client connecté. Actifs : {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Retire une connexion fermée de la liste."""
        self.active_connections.discard(websocket)
        logger.info(f"❌ Client déconnecté. Actifs : {len(self.active_connections)}")

    async def _broadcast(self, message: dict) -> None:
        """
        Méthode interne partagée par tous les broadcast publics.
        Envoie le message JSON à tous les clients connectés et nettoie
        automatiquement les connexions qui ont été fermées entre-temps.
        """
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"❌ Erreur envoi WebSocket : {e}")
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast_facture_update(self, facture_data: dict) -> None:
        """Notifie tous les clients qu'une facture existante a changé."""
        await self._broadcast({
            "type": "facture_updated",
            "data": facture_data
        })

    async def broadcast_facture_created(self, facture_data: dict) -> None:
        """Notifie tous les clients qu'une nouvelle facture a été créée."""
        await self._broadcast({
            "type": "facture_created",
            "data": facture_data
        })

    async def broadcast_alerte(self, alerte_data: dict) -> None:
        """
        Notifie tous les clients qu'une alerte vient d'être déclenchée.

        Le frontend écoute le type "nouvelle_alerte" pour :
          - incrémenter le badge rouge de la cloche en temps réel
          - afficher un toast de notification sans que l'utilisateur
            ait besoin de recharger la page

        alerte_data doit contenir au minimum :
          idAlerte, typeAlerte, message, idFacture, codeFacture
        """
        await self._broadcast({
            "type": "nouvelle_alerte",
            "data": alerte_data
        })


# Instance globale importée partout dans l'application
manager = WebSocketManager()
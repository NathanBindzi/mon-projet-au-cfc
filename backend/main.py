"""
Point d'entrée principal de l'API FastAPI
Plateforme Partagée de Suivi des Factures - CFC
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import logging

from schemas.database import engine, Base
from routers import (
    auth, utilisateurs, courriers, factures,
    validations, ticketEB, alertes, logs
)
from async_managers.kafka_manager import start_kafka_consumers, stop_kafka_consumers
from async_managers.websocket_manager import manager

# ── Scheduler des échéances ───────────────────────────────────────────────────
from async_managers.echeance_scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CFC Invoice Tracker API",
    description="API de la Plateforme Partagée de Suivi des Factures au CFC",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    # Crée les tables si elles n'existent pas encore
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Tables vérifiées / créées")

    # Lance les consumers Kafka dans leurs threads daemon
    start_kafka_consumers()
    logger.info("✅ Consumers Kafka démarrés")

    # Lance le scheduler de vérification des échéances
    # Il doit démarrer APRÈS la création des tables
    start_scheduler()
    logger.info("✅ Scheduler des échéances démarré")


@app.on_event("shutdown")
async def shutdown():
    # Arrêt propre dans l'ordre inverse du démarrage
    stop_scheduler()
    stop_kafka_consumers()
    logger.info("✅ Application arrêtée proprement")


@app.websocket("/ws/factures")
async def websocket_factures(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Maintient la connexion ouverte — le serveur pousse les événements
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"❌ Erreur WebSocket : {e}")
        manager.disconnect(websocket)


app.include_router(auth.router,                      prefix="/api/auth",         tags=["Authentification"])
app.include_router(utilisateurs.router,              prefix="/api/utilisateurs", tags=["Utilisateurs"])
app.include_router(courriers.router,                 prefix="/api/courriers",    tags=["Courriers"])
app.include_router(factures.router,                  prefix="/api/factures",     tags=["Factures"])
app.include_router(validations.router_validations,   prefix="/api/validations",  tags=["Validations"])
app.include_router(ticketEB.router_tickets,          prefix="/api/ticketEB",     tags=["Tickets EB"])
app.include_router(alertes.router_alertes,           prefix="/api/alertes",      tags=["Alertes"])
app.include_router(logs.router_logs,                 prefix="/api/logs",         tags=["Logs"])


@app.get("/", tags=["Santé"])
def root():
    return {
        "message": "API CFC Invoice Tracker opérationnelle ✅",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health", tags=["Santé"])
def health():
    return {"status": "ok"}
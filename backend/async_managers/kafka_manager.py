# async_managers/kafka_manager.py
"""
Gestionnaire des consumers Kafka.
Lance chaque consumer dans son propre thread daemon et leur transmet
la loop asyncio de FastAPI pour qu'ils puissent broadcaster via WebSocket.
"""
import asyncio
import threading
import logging

logger = logging.getLogger(__name__)

# Références aux threads — utile pour le monitoring et l'arrêt propre
_consumer_threads: list[threading.Thread] = []


def start_kafka_consumers():
    """
    Lance tous les consumers Kafka dans des threads daemon séparés.

    ORDRE IMPORTANT : on capture la loop FastAPI AVANT de lancer les threads.
    get_event_loop() ne renvoie la bonne loop QUE depuis le thread principal
    au moment du startup de FastAPI.
    """
    global _consumer_threads

    # ── Capture de la loop FastAPI ────────────────────────────────────────────
    loop = asyncio.get_event_loop()

    # ── Consumer 1 : Mailsoft ─────────────────────────────────────────────────
    try:
        from async_managers.consumers.mailsoft_consumer import mailsoft_consumer
        mailsoft_consumer.set_event_loop(loop)

        t_mailsoft = threading.Thread(
            target=mailsoft_consumer.start,
            daemon=True,                          # s'arrête quand FastAPI s'arrête
            name="kafka-mailsoft-consumer"
        )
        t_mailsoft.start()
        _consumer_threads.append(t_mailsoft)
        logger.info(f"✅ Thread consumer démarré : {t_mailsoft.name}")
    except ImportError as e:
        logger.error(f"❌ Impossible d'importer le consumer Mailsoft : {e}")

    # ── Consumer 2 : Carthago ─────────────────────────────────────────────────
    try:
        from async_managers.consumers.carthago_consumer import carthago_consumer
        carthago_consumer.set_event_loop(loop)

        t_carthago = threading.Thread(
            target=carthago_consumer.start,
            daemon=True,
            name="kafka-carthago-consumer"
        )
        t_carthago.start()
        _consumer_threads.append(t_carthago)
        logger.info(f"✅ Thread consumer démarré : {t_carthago.name}")
    except ImportError as e:
        logger.error(f"❌ Impossible d'importer le consumer Carthago : {e}")


def stop_kafka_consumers():
    """
    Arrêt propre de tous les consumers.
    Appelé par le hook @app.on_event("shutdown") de FastAPI.
    """
    # ── Mailsoft ──────────────────────────────────────────────────────────────
    try:
        from async_managers.consumers.mailsoft_consumer import mailsoft_consumer
        mailsoft_consumer.stop()
    except Exception as e:
        logger.error(f"Erreur arrêt consumer Mailsoft : {e}")

    # ── Carthago ──────────────────────────────────────────────────────────────
    try:
        from async_managers.consumers.carthago_consumer import carthago_consumer
        carthago_consumer.stop()
    except Exception as e:
        logger.error(f"Erreur arrêt consumer Carthago : {e}")

    logger.info("✅ Tous les consumers Kafka arrêtés.")
import { useEffect, useRef, useCallback } from "react";
import { StatutFactureEnum } from "../types";
interface FactureUpdate {
  idFacture: number;
  codeUnique: string;
  statut: StatutFactureEnum;
  referenceEB: string | null;
  updated_at: string;
}

interface UseFacturesWebSocketOptions {
  onFactureUpdate?: (facture: FactureUpdate) => void;
  onFactureCreated?: (facture: FactureUpdate) => void;
  onError?: (error: string) => void;
}

export function useFacturesWebSocket(options: UseFacturesWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/factures`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connecté");
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === "facture_updated") {
            options.onFactureUpdate?.(message.data);
          } else if (message.type === "facture_created") {
            options.onFactureCreated?.(message.data);
          }
        } catch (error) {
          console.error("❌ Erreur parsing WebSocket:", error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("❌ Erreur WebSocket:", error);
        options.onError?.("Erreur de connexion WebSocket");
      };

      wsRef.current.onclose = () => {
        console.log("⛔ WebSocket fermé");
        attemptReconnect();
      };
    } catch (error) {
      console.error("❌ Erreur création WebSocket:", error);
      options.onError?.("Impossible de créer la connexion WebSocket");
      attemptReconnect();
    }
  }, [options]);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts.current < maxReconnectAttempts) {
      reconnectAttempts.current += 1;
      console.log(
        `🔄 Reconnexion tentative ${reconnectAttempts.current}/${maxReconnectAttempts}...`
      );
      
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, reconnectDelay);
    } else {
      options.onError?.("Impossible de se reconnecter au serveur");
    }
  }, [connect, options]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    console.log("✅ WebSocket déconnecté");
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    disconnect,
    reconnect: connect,
  };
}

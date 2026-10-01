"use client";
// Botón "Probar en este navegador": añade al formulario el endpoint de la suscripción push de este navegador
import { useEffect, useState } from "react";

export function EndpointPropio() {
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration("/").then((r) => r?.pushManager.getSubscription()).then((s) => setEndpoint(s?.endpoint ?? "")).catch(() => {});
  }, []);
  return <input type="hidden" name="endpoint" value={endpoint} />;
}

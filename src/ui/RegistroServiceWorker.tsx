"use client";
// Registra el service worker de la PWA (public/sw.js). Solo en producción: en desarrollo la caché confunde.
import { useEffect } from "react";

export function RegistroServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

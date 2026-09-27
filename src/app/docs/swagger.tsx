"use client";
import Script from "next/script";

declare global {
  interface Window { SwaggerUIBundle?: (opts: Record<string, unknown>) => unknown }
}

export default function Swagger() {
  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.20.0/swagger-ui-bundle.js"
      strategy="afterInteractive"
      onLoad={() => window.SwaggerUIBundle?.({ url: "/api/openapi.json", dom_id: "#swagger", persistAuthorization: true, deepLinking: true })}
    />
  );
}

# Certificados intermedios adicionales

El servidor `www.bcv.org.ve` **no envía la cadena completa**: su certificado (`*.bcv.org.ve`, emitido por
*Sectigo Public Server Authentication CA DV R36*, vence el 20/11/2026) llega acompañado de un intermediario
distinto y antiguo. Los clientes TLS estrictos fallan con `unable to verify the first certificate`.

La solución segura es **agregar el intermediario correcto**, nunca desactivar la verificación:

| Archivo | Certificado | SHA-256 | Vence |
|---|---|---|---|
| `sectigo-public-server-authentication-ca-dv-r36.pem` | Sectigo Public Server Authentication CA DV R36 (emisor: Sectigo Public Server Authentication Root R46) | `8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0` | 21/03/2036 |

- **Origen:** `http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt`, la URL "CA Issuers" que declara el propio certificado del BCV.
- **Uso en Node.js:** `NODE_EXTRA_CA_CERTS=/ruta/config/ca/sectigo-public-server-authentication-ca-dv-r36.pem`.
- **Verificado el 27/09/2026:** `curl --cacert (sistema + este PEM) https://www.bcv.org.ve/` → HTTP 200, verificación TLS = 0.
- **Revisar cuando el BCV renueve su certificado** (vence el 20/11/2026): el emisor puede cambiar.

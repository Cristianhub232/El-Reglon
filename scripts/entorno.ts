// Carga .env (si existe) para los scripts; Next.js lo hace por su cuenta.
try { process.loadEnvFile(".env"); } catch { /* sin .env: se usan las variables del proceso */ }

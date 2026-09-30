// Inicio de sesión del panel (resources/Login.dc.html)
import Link from "next/link";
import { redirect } from "next/navigation";
import { consulta } from "../../core/db.ts";
import { usuarioActual } from "../../core/auth/dal.ts";
import { ROLES, type Rol } from "../../core/auth/roles.ts";
import { Logo } from "../../ui/Logo.tsx";
import { FormularioIngreso } from "./FormularioIngreso.tsx";
import s from "./ingreso.module.css";

export const metadata = { title: "Iniciar sesión", robots: { index: false } };
export const dynamic = "force-dynamic";

// Operativo si la base responde y la última lectura del BCV (si la hubo) no falló
async function estadoServicio(): Promise<boolean> {
  try {
    const [f] = await consulta<{ accion: string | null }>(
      "SELECT (SELECT accion FROM core.auditoria WHERE accion LIKE 'bcv.%' ORDER BY ocurrido_en DESC LIMIT 1) AS accion");
    return f.accion !== "bcv.lectura_fallida";
  } catch { return false; }
}

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  if (await usuarioActual()) redirect("/admin");
  const { siguiente } = await searchParams;
  const operativo = await estadoServicio();
  const whatsapp = process.env.SOPORTE_WHATSAPP?.replace(/\D/g, "");
  const correo = process.env.SOPORTE_CORREO;
  return (
    <div className={s.pagina}>
      <aside className={s.lateral}>
        <Link href="/" className={s.lateralMarca} aria-label="El Renglón, inicio"><Logo tipo="horizontal" variante="claro" fondo="#FFFFFF" slogan /></Link>
        <div className={s.lateralTexto}>
          <span className="sobretitulo">Panel de administración</span>
          <h1 className={s.titulo}>Administración del ecosistema fiscal</h1>
          <p className={`${s.lead} ${s.ocultarMovil}`}>API keys, catálogo legal de IVA, arancel, calendario tributario y auditoría. Cada cambio queda versionado con quién, cuándo y por qué.</p>
          <div className={`${s.roles} ${s.ocultarMovil}`}>
            {(Object.keys(ROLES) as Rol[]).map((r) => (
              <div key={r} className={s.rol} style={{ ["--color" as string]: ROLES[r].color }}>
                <span className={s.rolNombre}>{ROLES[r].corto}</span>
                <span className={s.rolTexto}>{ROLES[r].descripcion}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`${s.lateralPie} ${s.ocultarMovil}`}>
          {operativo ? <span className="punto t-exento" style={{ fontWeight: 600 }}>Todos los servicios operativos</span>
            : <span className="punto t-condicionado" style={{ fontWeight: 600 }}>Servicio con novedades</span>}
          <span>Resultados orientativos: no constituyen asesoría tributaria ni aduanera.</span>
        </div>
      </aside>

      <main className={s.principal}>
        <div className={s.arriba}>
          <Link href="/" className={s.volver}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 2L4 7l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Volver a El Renglón
          </Link>
          <a href="#soporte">¿Necesitas ayuda?</a>
        </div>
        <div className={s.centro}>
          <div className={s.caja}>
            <div className={s.cajaCabeza}>
              <h2>Iniciar sesión</h2>
              <span>Usa la cuenta que te asignó el administrador del sistema.</span>
            </div>
            <FormularioIngreso siguiente={siguiente ?? null} />
            <div className={s.nota}>¿Solo necesitas consumir la API? <Link href="/solicitar-api-key">Solicita una API key gratis</Link> o consulta sin cuenta desde la <Link href="/">página principal</Link>.</div>
          </div>
        </div>
        <section id="soporte" className={s.soporte}>
          <div className={s.soporteCabeza}>
            <strong>Contáctanos · soporte</strong>
            <span>Lun a vie · 8:00 a 17:00, hora de Caracas</span>
          </div>
          <p className={s.soporteNota}>¿Olvidaste tu contraseña? Pídele a un administrador del sistema que la restablezca: recibirás una temporal para cambiarla al entrar.</p>
          <div className={s.canales}>
            {whatsapp && (
              <a className={s.canal} href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                <span className={s.canalIcono} style={{ background: "#25D366" }}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z" fill="none" stroke="#FFFFFF" strokeWidth="1.7" strokeLinejoin="round" /><path d="M9.1 8.2c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.3.6 1.4 1.9 2.8 2.4.2.1.4 0 .5-.1l.6-.7c.2-.2.4-.2.6-.1l1.5.7c.2.1.4.2.4.4 0 .3 0 1-.5 1.5-.5.4-1.4.8-2.4.5-1.4-.4-2.9-1.3-4-2.6-1-1.2-1.6-2.4-1.7-3.3 0-.9.3-1.6.5-2z" fill="#FFFFFF" /></svg></span>
                <span>WhatsApp</span>
              </a>
            )}
            {correo && (
              <a className={s.canal} href={`mailto:${correo}`}>
                <span className={s.canalIcono} style={{ background: "#0E2440" }}><svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11" rx="1.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" /><path d="M3 5.5l7 5.5 7-5.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round" /></svg></span>
                <span>Correo</span>
              </a>
            )}
            <Link className={s.canal} href="/docs">
              <span className={s.canalIcono} style={{ background: "#F2B632" }}><svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="#0E2440" strokeWidth="1.6" /><path d="M7.8 7.8a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.4v.5" fill="none" stroke="#0E2440" strokeWidth="1.6" strokeLinecap="round" /><circle cx="10" cy="14.4" r="1" fill="#0E2440" /></svg></span>
              <span>Centro de ayuda</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

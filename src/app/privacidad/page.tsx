// Privacidad: qué registra El Renglón del sitio público, para qué y por cuánto tiempo (docs/23)
import Link from "next/link";
import { Cabecera, PiePagina } from "../../ui/sitio/Cabecera.tsx";
import s from "../../ui/sitio/privacidad.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacidad", description: "Qué datos registra El Renglón, para qué y por cuánto tiempo.", alternates: { canonical: "/privacidad" } };

const RESUMEN = [
  ["Cookie propia", "Un identificador aleatorio para contar visitas. Sin cookies de terceros ni publicidad."],
  ["IP y navegador", "Por cada página vista: IP, navegador, sistema, dispositivo y de dónde llegaste."],
  ["RIF consultados", "En «Mis deberes tributarios» y en la API, con fines estadísticos."],
  ["12 meses", "Después se borran solos. No vendemos ni compartimos estos datos."],
] as const;

const SECCIONES = [["visitas", "Visitas"], ["rif", "RIF consultados"], ["avisos", "Avisos"], ["uso", "Para qué y quién los ve"], ["plazo", "Por cuánto tiempo"], ["derechos", "Tus derechos"]] as const;

export default function Privacidad() {
  const correo = process.env.SOPORTE_CORREO;
  return (
    <div className={s.pagina}>
      <Cabecera />
      <main className={s.contenido}>
        <header className={s.cabeza}>
          <span className="sobretitulo">Privacidad</span>
          <h1>Qué registramos y para qué</h1>
          <p>El Renglón es gratuito y no pide registrarse para usar sus herramientas. Para saber cómo se usa y mejorarlo, registramos lo siguiente.</p>
        </header>

        <section className={s.resumen} aria-label="En resumen">
          {RESUMEN.map(([t, x]) => <div key={t}><strong>{t}</strong><span>{x}</span></div>)}
        </section>

        <div className={s.cuerpo}>
          <nav className={s.indice} aria-label="Secciones">
            <span>En esta página</span>
            {SECCIONES.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
          </nav>

          <article className={s.texto}>
            <section id="visitas">
              <h2>Visitas</h2>
              <p>Al entrar, el navegador recibe una <strong>cookie propia</strong> («renglon_visitante») con un identificador aleatorio que no contiene datos tuyos; sirve para distinguir a quien visita por primera vez de quien vuelve.</p>
              <p>Por cada página vista registramos:</p>
              <ul>
                <li>la fecha y la hora, y la página;</li>
                <li>el sitio desde el que llegaste, sin parámetros;</li>
                <li>tu <strong>dirección IP</strong>;</li>
                <li>el navegador, el sistema, el tipo de dispositivo, el idioma y el tamaño de la pantalla.</li>
              </ul>
              <p>No usamos cookies de terceros, publicidad ni seguimiento entre sitios. El panel de administración y los robots de los buscadores no se registran.</p>
            </section>

            <section id="rif">
              <h2>RIF consultados</h2>
              <p>Cuando consultas los deberes tributarios de un RIF en «Mis deberes tributarios», o cuando una aplicación consulta un RIF por nuestra API, registramos el RIF, el tipo de contribuyente, las condiciones marcadas, la fecha y la hora, la IP y, si la hay, la cookie de visitante.</p>
              <p>Los RIF de personas naturales (V y E) contienen la cédula: son datos personales y los tratamos como tales.</p>
            </section>

            <section id="avisos">
              <h2>Avisos</h2>
              <p>Si activas los avisos con la campana de la cabecera, guardamos la <strong>suscripción de tu navegador</strong> (la dirección que el servicio de notificaciones de tu navegador le asigna, con sus claves de cifrado), los temas que elegiste y, si sigues tus deberes tributarios, los <strong>RIF</strong> con su tipo de contribuyente y sus condiciones.</p>
              <p>Los usamos solo para enviarte esos avisos. El contenido de cada aviso va cifrado hasta tu navegador.</p>
              <p>Al pulsar «Desactivar avisos», o si quitas el permiso de notificaciones en tu navegador, la suscripción y sus RIF se borran.</p>
            </section>

            <section id="uso">
              <h2>Para qué y quién los ve</h2>
              <p>Solo para estadísticas del servicio y para mejorarlo: qué herramientas se usan, desde dónde y qué falta. No vendemos ni compartimos estos datos.</p>
              <p>Solo el equipo de administración de El Renglón puede verlos; las herramientas de análisis internas no ven la IP.</p>
            </section>

            <section id="plazo">
              <h2>Por cuánto tiempo</h2>
              <p>Las visitas y los RIF consultados se borran automáticamente a los <strong>12 meses</strong>. Las suscripciones a los avisos se guardan mientras estén activas.</p>
            </section>

            <section id="derechos">
              <h2>Tus derechos</h2>
              <p>Puedes pedir saber qué datos tenemos asociados a tu RIF o a tu conexión, y pedir que se borren (Constitución, art. 28){correo ? <>, escribiendo a <a href={`mailto:${correo}`}>{correo}</a></> : null}. También puedes borrar la cookie desde tu navegador en cualquier momento.</p>
              <p className={s.nota}>Lo que guardas en tu propio navegador («Recordar mi RIF en este equipo», filtros del comparador) no llega a nuestros servidores. <Link href="/">Volver al inicio</Link></p>
            </section>
          </article>
        </div>
      </main>
      <PiePagina />
    </div>
  );
}

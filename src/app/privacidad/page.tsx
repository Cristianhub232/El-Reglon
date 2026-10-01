// Privacidad: qué registra El Renglón del sitio público, para qué y por cuánto tiempo (docs/23)
import Link from "next/link";
import { Cabecera, PiePagina } from "../../ui/sitio/Cabecera.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacidad", description: "Qué datos registra El Renglón, para qué y por cuánto tiempo.", alternates: { canonical: "/privacidad" } };

const estilo = { h2: { font: "700 24px/1.2 var(--serif)", color: "var(--tinta)", marginTop: 12 }, p: { fontSize: 16, lineHeight: 1.6, color: "var(--texto-2)" } } as const;

export default function Privacidad() {
  const correo = process.env.SOPORTE_CORREO;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Cabecera />
      <main style={{ flex: 1, padding: "56px var(--margen) 72px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
        <span className="sobretitulo">Privacidad</span>
        <h1 style={{ font: "700 clamp(34px, 4vw, 48px)/1.1 var(--serif)", color: "var(--tinta)" }}>Qué registramos y para qué</h1>
        <p style={estilo.p}>El Renglón es gratuito y no pide registrarse para usar sus herramientas. Para saber cómo se usa y mejorarlo, registramos lo siguiente:</p>

        <h2 style={estilo.h2}>Visitas</h2>
        <p style={estilo.p}>
          Al entrar, el navegador recibe una <strong>cookie propia</strong> («renglon_visitante») con un identificador aleatorio que no contiene datos tuyos;
          sirve para distinguir visitantes nuevos de los que vuelven. Por cada página vista registramos: la fecha y hora, la página, el sitio desde el que
          llegaste (sin parámetros), tu <strong>dirección IP</strong>, el navegador, el sistema, el tipo de dispositivo, el idioma y el tamaño de la pantalla.
          No usamos cookies de terceros, publicidad ni seguimiento entre sitios.
        </p>

        <h2 style={estilo.h2}>RIF consultados</h2>
        <p style={estilo.p}>
          Cuando consultas los deberes tributarios de un RIF en «Mis deberes tributarios», o cuando una aplicación consulta un RIF por nuestra API,
          registramos el RIF, el tipo de contribuyente, las condiciones marcadas, la fecha y hora, la IP y, si la hay, la cookie de visitante.
          Los RIF de personas naturales (V y E) contienen la cédula: son datos personales y los tratamos como tales.
        </p>

        <h2 style={estilo.h2}>Para qué y quién los ve</h2>
        <p style={estilo.p}>
          Solo para estadísticas del servicio y para mejorarlo (qué herramientas se usan, desde dónde, qué falta). No vendemos ni compartimos estos datos.
          Solo el equipo de administración de El Renglón puede verlos; las herramientas de análisis internas no ven la IP.
        </p>

        <h2 style={estilo.h2}>Por cuánto tiempo</h2>
        <p style={estilo.p}>Las visitas y los RIF consultados se borran automáticamente a los <strong>12 meses</strong>.</p>

        <h2 style={estilo.h2}>Tus derechos</h2>
        <p style={estilo.p}>
          Puedes pedir saber qué datos tenemos asociados a tu RIF o a tu conexión, y pedir que se borren (Constitución, art. 28)
          {correo ? <> escribiendo a <a href={`mailto:${correo}`}>{correo}</a></> : null}. También puedes borrar la cookie desde tu navegador en cualquier momento.
        </p>
        <p style={{ ...estilo.p, fontSize: 14, color: "var(--texto-3)" }}>
          Lo que guardas en tu propio navegador («Recordar mi RIF en este equipo», filtros del comparador) no llega a nuestros servidores. <Link href="/">Volver al inicio</Link>
        </p>
      </main>
      <PiePagina />
    </div>
  );
}

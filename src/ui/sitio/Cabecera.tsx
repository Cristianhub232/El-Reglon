import Link from "next/link";
import { Logo } from "../Logo.tsx";
import s from "./sitio.module.css";

export function Cabecera() {
  return (
    <header className={s.cabecera}>
      <div className={s.cabeceraInterior}>
        <Link href="/" className={s.marca} aria-label="El Renglón, inicio">
          <Logo tipo="horizontal" variante="claro" fondo="#F6F3EA" />
        </Link>
        <nav className={s.nav} aria-label="Principal">
          <Link href="/#herramientas">Herramientas</Link>
          <Link href="/#noticias">Noticias</Link>
          <Link href="/#modulos">Módulos</Link>
          <Link href="/#api" className={s.navOpcional2}>API</Link>
          <Link href="/docs" className={s.navOpcional}>Documentación</Link>
        </nav>
        <div className={s.acciones}>
          <Link href="/ingresar" className={s.ingresar}>Iniciar sesión</Link>
          <Link href="/#api" className={`boton boton-primario ${s.obtener}`}><span className={s.obtenerLargo}>Obtener </span>API key</Link>
        </div>
      </div>
    </header>
  );
}

export function PiePagina() {
  return (
    <footer className={s.pie}>
      <div className={s.pieInterior}>
        <div className={s.pieMarca}>
          <span className={s.pieSimbolo}><Logo tipo="simbolo" variante="claro" fondo="#F6F3EA" /></span>
          <span>Resultados orientativos: no constituyen asesoría tributaria ni aduanera.</span>
        </div>
        <div className={s.pieEnlaces}>
          <span>Datos de productos: Open Food Facts (ODbL)</span>
          <a href="/api/salud">Estado del servicio</a>
          <Link href="/docs">Swagger</Link>
        </div>
      </div>
    </footer>
  );
}

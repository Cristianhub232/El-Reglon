// Página principal (resources/Landing v2.dc.html) con datos reales: tasas BCV, clasificador, alícuotas y días inhábiles.
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { clasificarSolicitud } from "../modules/iva/clasificador.ts";
import { datosPortada } from "../modules/web/portada.ts";
import { Cabecera, PiePagina } from "../ui/sitio/Cabecera.tsx";
import { BarraClasificador, ClasificadorProvider, PanelClasificador, type Resultado } from "../ui/sitio/Clasificador.tsx";
import { EJEMPLOS } from "../ui/sitio/ejemplos.ts";
import { TitularItem, TitularPrincipal } from "../ui/sitio/Titulares.tsx";
import { CasosDeUso } from "../ui/sitio/Casos.tsx";
import { DiaEnCifras } from "../ui/sitio/DiaEnCifras.tsx";
import { Comparador } from "../ui/sitio/Comparador.tsx";
import { HistorialTasas } from "../ui/sitio/HistorialTasas.tsx";
import { MisDeberes } from "../ui/sitio/MisDeberes.tsx";
import { condiciones as condicionesCal } from "../modules/calendario/consultas.ts";
import { tiendasActivas } from "../modules/comparador/buscador.ts";
import { imagenReferencia } from "../modules/comparador/referencia.ts";
import { datosCasos } from "../modules/web/casos.ts";
import { Conversor } from "../ui/sitio/Conversor.tsx";
import { Grafica } from "../ui/sitio/Grafica.tsx";
import { diaSemana, fecha, fechaCorta, fechaLarga, hora, numero } from "../ui/formato.ts";
import s from "../ui/sitio/portada.module.css";

export const dynamic = "force-dynamic";
export const metadata = { alternates: { canonical: "/" } };

const MODULOS = [
  ["IVA", "Clasificación de bienes y servicios según la Ley de IVA: exento, 8 %, 16 % o 16 % + 15 %, con su base legal.", "/api/v1/iva"],
  ["BCV", "Tasa oficial del BCV en dólares y euros por fecha valor, histórico desde 2025, tasa aplicable y conversión.", "/api/v1/bcv"],
  ["Arancel", "Arancel de Aduanas vigente (Decreto 4.944 con las reformas de 2025): códigos, búsqueda, régimen legal y detección del código de un producto.", "/api/v1/arancel"],
  ["Calendario", "Próximos deberes tributarios 2026 por RIF, para contribuyentes especiales y ordinarios, con prórrogas del COT art. 10.", "/api/v1/calendario"],
  ["RIF", "Validación del RIF con dígito verificador.", "/api/v1/rif"],
  ["Noticias", "Titulares de diez medios venezolanos, actualizados cada hora, con enlace al artículo original.", "/api/v1/noticias"],
  ["Comparador", "Precio de un producto en varias tiendas venezolanas en línea, emparejado por código de barras, en Bs. y US$.", "/api/v1/comparador"],
] as const;

function Variacion({ v, corta }: { v: number | null; corta?: boolean }) {
  if (v === null) return null;
  const txt = `${numero(Math.abs(v), 2)} %`;
  return <span className={v >= 0 ? s.sube : s.baja}>{corta ? `${v >= 0 ? "+" : "−"}${txt}` : `${v >= 0 ? "▲" : "▼"} ${txt}`}</span>;
}

export default async function Portada() {
  const d = await datosPortada();
  const host = (await headers()).get("host") ?? "elrenglon.com.ve";
  const origen = `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;
  const inicial = await clasificarSolicitud({ nombre: EJEMPLOS[0].texto, operacion: "nacional", precio_compra: null, precio_venta: null, moneda: null }, null)
    .catch(() => null) as Resultado | null;
  if (inicial?.estado === "determinado") inicial.imagen_referencia = await imagenReferencia(EJEMPLOS[0].texto, []).catch(() => null);
  const usd = d.bcv?.monedas.find((m) => m.codigo === "USD");
  const casos = await datosCasos(d.hoy, usd?.tasa ?? null);
  const tiendasComparador = await tiendasActivas().catch(() => []);
  const condicionesCalendario = (await condicionesCal().catch(() => ({ condiciones: [] }))).condiciones as { codigo: string; descripcion: string }[];
  const eur = d.bcv?.monedas.find((m) => m.codigo === "EUR");
  const proximo = d.inhabiles[0];
  const [principal, ...resto] = d.noticias;

  return (
    <div className={s.pagina}>
      <Cabecera />

      <div className={s.franja}>
        <div className={s.franjaInterior}>
          {usd && <span className={s.franjaDato}>BCV USD <strong>{numero(usd.tasa, 4)}</strong><Variacion v={usd.variacion} corta /></span>}
          {eur && <span className={s.franjaDato}>EUR <strong>{numero(eur.tasa, 4)}</strong><Variacion v={eur.variacion} corta /></span>}
          {d.bcv && <span className={s.franjaDato}>Fecha valor {fecha(d.bcv.fecha_valor)}</span>}
          {proximo && <span className={s.franjaDato}>Próximo día inhábil: <b>{fechaCorta(proximo.fecha)} · {proximo.descripcion.replace(/ \(.*\)$/, "")}</b></span>}
        </div>
      </div>

      <ClasificadorProvider inicial={inicial}>
        <section className={s.hero}>
          <div className={s.heroRejilla}>
            <div className={s.heroTexto}>
              <div className={s.heroTextoArriba}>
                <span className={s.heroEtiqueta}>Gratis · abierto · con base legal oficial</span>
                <h1 className={s.heroTitulo}>Cómo tributa cada renglón.</h1>
                <p className={s.heroLead}>El IVA de cada producto con su base legal, la tasa oficial del BCV y dónde comprarlo más barato en las principales cadenas del país. También el arancel de aduanas, el calendario tributario y la validación del RIF. Todo en un solo lugar, para toda Venezuela.</p>
                <div className={s.heroBotones}>
                  <a href="#herramientas" className="boton boton-primario">Consultar gratis</a>
                  <a href="#comparador" className="boton boton-secundario">Comparar precios</a>
                </div>
              </div>
              <div className={s.fuentes}>
                <span>Fuentes oficiales</span>
                <div className={s.fuentesLista}><span>SENIAT</span><span>BCV</span><span>SUDEBAN</span><span>Gaceta Oficial</span></div>
              </div>
            </div>

            <div className={s.heroDatos}>
              <div className={s.tasas} id="tasas">
                <div className={s.tasasCabeza}>
                  <strong>Tasa oficial BCV {d.bcv?.vigente ? "de hoy" : "vigente"}</strong>
                  {d.bcv && <span className={s.tasasFecha}>Fecha valor {diaSemana(d.bcv.fecha_valor)} {fecha(d.bcv.fecha_valor)}{d.bcv.historial.length > 1 && <HistorialTasas historial={d.bcv.historial} />}</span>}
                </div>
                {d.bcv && !d.bcv.vigente && (
                  <span className={s.aviso}>Aún no hay tasa publicada con fecha valor de hoy: se muestra la última publicación del BCV.</span>
                )}
                <div className={s.tasasRejilla}>
                  {[usd, eur].filter(Boolean).map((m, i) => (
                    <div key={m!.codigo} className={s.tasa}>
                      <div className={s.tasaFila}>
                        <span className={s.tasaMoneda}>{m!.codigo === "USD" ? "USD · Dólar" : "EUR · Euro"}</span>
                        <span className={s.tasaVariacion}><Variacion v={m!.variacion} /></span>
                      </div>
                      <div className={s.tasaValorFila}>
                        <span className={s.tasaValor}><span>Bs.</span><strong>{numero(m!.tasa, 4)}</strong></span>
                        <Grafica valores={m!.serie} id={`g${m!.codigo}`} retraso={250 + i * 200}
                          color={(m!.variacion ?? 0) >= 0 ? "#2E7D5B" : "#B8352B"} />
                      </div>
                      <span className={s.tasaNota}>por 1 {m!.codigo} · últimas {m!.serie.length} publicaciones</span>
                    </div>
                  ))}
                </div>
                <span className={s.tasasPie}>
                  Fuente: Banco Central de Venezuela · tasa aplicable según art. 25 de la Ley de IVA
                  {d.bcv?.leida ? ` · leída a las ${hora(d.bcv.leida)}, hora de Caracas` : ""}
                </span>
                {d.p2p && (
                  <div className={s.p2p} aria-labelledby="p2p-titulo">
                    <div className={s.p2pCabeza}>
                      <span id="p2p-titulo" className={s.tasaMoneda}>USDT · Binance P2P</span>
                      <span className={s.p2pEtiqueta}>Referencia de mercado · no oficial</span>
                    </div>
                    <div className={s.p2pCentro}>
                      <span className={s.p2pValor}><span>Bs.</span><strong>{numero(d.p2p.promedio, 2)}</strong></span>
                      {d.p2p.brecha_pct && (
                        <span className={`${s.brecha} ${Number(d.p2p.brecha_pct) < 0 ? s.brechaBaja : ""}`}>
                          <strong>{Number(d.p2p.brecha_pct) >= 0 ? "▲ +" : "▼ −"}{numero(Math.abs(Number(d.p2p.brecha_pct)), 1)} %</strong>
                          <span>frente al BCV</span>
                        </span>
                      )}
                    </div>
                    <span className={s.p2pNota}>promedio por 1 USDT</span>
                    <dl className={s.p2pDatos}>
                      <div><dt>Compra</dt><dd>Bs. {numero(d.p2p.compra, 2)}</dd></div>
                      <div><dt>Venta</dt><dd>Bs. {numero(d.p2p.venta, 2)}</dd></div>
                      {d.p2p.bcv && <div><dt>BCV</dt><dd>Bs. {numero(d.p2p.bcv.tasa, 2)}</dd></div>}
                    </dl>
                    <span className={s.p2pPie}>
                      Fuente: Binance P2P vía CriptoYa · leída a las {hora(d.p2p.leida_en)} · no es la tasa aplicable a efectos tributarios
                    </span>
                  </div>
                )}
              </div>
              <div className={`${s.foto} ${d.enCifras.length ? s.fotoCifras : ""}`}>
                {d.enCifras.length ? <DiaEnCifras tarjetas={d.enCifras} /> : (
                  <Image src="/imagenes/bodega.webp" alt="Comerciante venezolano en su bodega, con el punto de venta a la vista" fill priority
                    sizes="(max-width: 1040px) 100vw, 50vw" />
                )}
                {usd && eur && d.bcv && <Conversor tasas={{ USD: usd.tasa, EUR: eur.tasa }} fechaValor={fechaCorta(d.bcv.fecha_valor)} />}
              </div>
            </div>
          </div>
          <BarraClasificador />
        </section>

        {tiendasComparador.length > 0 && <Comparador tiendas={tiendasComparador.map((x) => ({ id: x.id, nombre: x.nombre, rubros: x.rubros, ciudad: x.ubicacion?.ciudad ?? null }))} />}

        {principal && (
          <section id="noticias" className={`${s.seccion} ${s.noticias}`}>
            <div className={s.noticiasCabeza}>
              <div>
                <span className="sobretitulo">{fechaLarga(d.hoy)}</span>
                <h2 className={s.seccionTituloChico}>Noticias del día</h2>
              </div>
              <span>Titulares de medios venezolanos{d.noticiasLeidas ? ` · actualizado a las ${hora(d.noticiasLeidas)}` : ""} · <Link href="/noticias" className={s.masNoticias}>Ver todas</Link></span>
            </div>
            <div className={s.noticiasRejilla}>
              <TitularPrincipal t={principal} />
              <div className={s.lista}>
                {resto.map((t) => <TitularItem key={t.id} t={t} />)}
              </div>
            </div>
          </section>
        )}

        <CasosDeUso casos={casos} hoy={d.hoy} />

        <section id="herramientas" className={s.seccion}>
          <div className={s.seccionCabeza}>
            <span className={s.seccionEtiqueta}>Herramientas gratis</span>
            <h2 className={s.seccionTitulo}>Consulta sin registrarte</h2>
            <p className={s.seccionLead}>Las mismas respuestas que entrega la API, listas para comerciantes, contadores y desarrolladores.</p>
          </div>
          <div className={s.herramientas}>
            <PanelClasificador />
            <div className={s.columna}>
              <div className="tarjeta" style={{ overflow: "hidden" }}>
                <div className={s.herramientaCabeza}>
                  <h3>Alícuotas vigentes</h3>
                  <span>Ley que establece el Impuesto al Valor Agregado</span>
                </div>
                <div className={s.tabla}>
                  <div className={s.alicuota}><span className="t-exento">—</span><span>Exenta, exonerada o no sujeta</span><span>arts. 16–19</span></div>
                  <div className={s.alicuota}><span className="t-reducida">{d.alicuotas.reducida ? `${numero(d.alicuotas.reducida, 0)} %` : "—"}</span><span>Alícuota reducida</span><span>art. 64</span></div>
                  <div className={s.alicuota}><span className="t-general">{d.alicuotas.general ? `${numero(d.alicuotas.general, 0)} %` : "—"}</span><span>Alícuota general</span><span>art. 63</span></div>
                  <div className={s.alicuota}><span className="t-adicional">{d.alicuotas.general && d.alicuotas.adicional ? `${numero(Number(d.alicuotas.general) + Number(d.alicuotas.adicional), 0)} %` : "—"}</span><span>General más adicional (consumo suntuario)</span><span>arts. 27, 61</span></div>
                </div>
              </div>
              <div className={`tarjeta ${s.inhabiles}`}>
                <div className={s.inhabilesCabeza}><h3>Próximos días inhábiles</h3><span>COT art. 10</span></div>
                <div>
                  {d.inhabiles.map((x) => (
                    <div key={x.fecha} className={s.inhabil}>
                      <span>{fechaCorta(x.fecha)}</span>
                      <span>{x.descripcion.replace(/ \(.*\)$/, "")}<span className={s.apagado}> · {diaSemana(x.fecha)}</span></span>
                      <span>{x.tipo === "NACIONAL" ? "Nacional" : "Bancario"}</span>
                    </div>
                  ))}
                </div>
                <span className="aviso-legal">Los días bancarios no laborables también son inhábiles para declarar y pagar tributos.</span>
              </div>
            </div>
            <MisDeberes condiciones={condicionesCalendario} />
          </div>
        </section>
      </ClasificadorProvider>

      <section id="modulos" className={s.modulos}>
        <div className={s.modulosRejilla}>
          <div className={s.seccionCabeza} style={{ maxWidth: 380, gap: 12 }}>
            <span className={s.seccionEtiqueta}>Módulos</span>
            <h2 className={s.seccionTitulo}>Un ecosistema, una sola API key</h2>
            <p className={s.seccionLead}>Cada módulo tiene su fin propio y se puede consumir por separado. Los permisos se asignan por módulo.</p>
          </div>
          <div className={s.modulosLista}>
            {MODULOS.map(([nombre, texto, ruta], i) => (
              <div key={nombre} className={s.modulo}>
                <span className={s.moduloNumero}>{String(i + 1).padStart(2, "0")}</span>
                <div className={s.moduloNombre}>
                  <strong>{nombre}</strong>
                  {nombre === "IVA" ? <span className="punto t-condicionado">En validación</span> : <span className="punto t-exento">En servicio</span>}
                </div>
                <span>{texto}</span>
                <span className={s.moduloRuta}>{ruta}</span>
              </div>
            ))}
            <div className={s.proximamente}>Próximamente: Unidad Tributaria e IGTF.</div>
          </div>
        </div>
      </section>

      <section id="api" className={s.api}>
        <div className={s.apiRejilla}>
          <div className={s.apiTexto}>
            <span className={s.seccionEtiqueta}>Para desarrolladores</span>
            <h2 className={s.seccionTitulo}>Integra la clasificación en tu POS, ERP o tienda en línea</h2>
            <p className={s.seccionLead}>Documentación Swagger en <span className="mono" style={{ color: "var(--tinta)" }}>/docs</span>, errores claros y montos como texto decimal exacto. La API key es gratuita y tiene un límite de consultas por minuto.</p>
            <div className={s.vinetas}>
              <div>Nombre, EAN, UPC, ISBN, PLU, SKU o código arancelario</div>
              <div>Operación nacional o importación</div>
              <div>Renglón de la Forma 30 en cada respuesta</div>
            </div>
            <div className={s.heroBotones}>
              <Link href="/solicitar-api-key" className="boton boton-acento">Solicitar API key gratis</Link>
              <Link href="/docs" className="boton boton-secundario">Abrir Swagger</Link>
            </div>
          </div>
          <div className={s.codigo}>
            <div className={s.codigoCabeza}><b>POST</b><span>/api/v1/iva/clasificar</span></div>
            <pre>{`curl -X POST ${origen}/api/v1/iva/clasificar \\
  -H "X-API-Key: rgl_1a2b3c4d_••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{ "nombre": "Arroz Mary 1kg", "operacion": "nacional",
        "precio_compra": null, "precio_venta": null, "moneda": null }'`}</pre>
            <pre>{"{\n  \"estado\": "}<span className={s.jCadena}>&quot;determinado&quot;</span>{",\n  \"opciones\": [{\n    \"categoria\": "}<span className={s.jExento}>&quot;EXENTO&quot;</span>{",\n    \"base_legal\": [{ \"id\": \"LIVA-18-1-c\", \"articulo\": \"18\", … }],\n    \"concepto_declaracion\": \"Ventas internas no gravadas\"\n  }],\n  \"operacion\": \"nacional\"\n}"}</pre>
          </div>
        </div>
      </section>

      <section className={s.principios}>
        <div className={s.principio} style={{ ["--borde" as string]: "var(--amarillo)" }}><strong>Orienta, no bloquea</strong><span>Solo consulta y entrega la categorización. No deniega operaciones.</span></div>
        <div className={s.principio} style={{ ["--borde" as string]: "var(--azul)" }}><strong>Base legal verificada</strong><span>Textos legales contrastados contra la Gaceta Oficial.</span></div>
        <div className={s.principio} style={{ ["--borde" as string]: "var(--rojo)" }}><strong>Multiopción en zonas grises</strong><span>Cada opción con su condición en lenguaje claro. Tú decides.</span></div>
        <div className={s.principio} style={{ ["--borde" as string]: "var(--tinta)" }}><strong>Fuentes oficiales</strong><span>SENIAT, BCV, SUDEBAN y Gaceta Oficial. Solo contexto venezolano.</span></div>
      </section>

      <PiePagina />
    </div>
  );
}

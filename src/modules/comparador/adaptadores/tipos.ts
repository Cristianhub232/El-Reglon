// Lo que devuelve el lector de cada plataforma: la oferta tal como la publica la tienda, en su moneda
export interface OfertaTienda {
  id_externo: string; nombre: string; marca: string | null; ean: string | null; url: string; imagen: string | null;
  precio: string; precio_lista: string | null; disponible: boolean;
  leido_en?: string;          // tiendas por índice: cuándo se leyó la página (el precio puede tener unas horas)
}

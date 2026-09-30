// Estado de una cuenta del panel: desactivada, bloqueada por intentos, con contraseña temporal o activa
export function EstadoUsuario({ u }: { u: { activo: boolean; bloqueado: boolean; debe_cambiar_clave: boolean } }) {
  if (!u.activo) return <span className="punto t-adicional">desactivado</span>;
  if (u.bloqueado) return <span className="punto t-adicional">bloqueado</span>;
  if (u.debe_cambiar_clave) return <span className="punto t-condicionado">contraseña temporal</span>;
  return <span className="punto t-exento">activo</span>;
}

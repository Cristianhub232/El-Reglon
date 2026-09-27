import { especificacion } from "../../../openapi.ts";

export const dynamic = "force-static";

export function GET() {
  return Response.json(especificacion);
}

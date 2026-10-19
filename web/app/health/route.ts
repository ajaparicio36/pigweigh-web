import { connection } from "next/server";

export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

import { dynamics } from "../../dynamics-data";
import { dynamicsMetrics } from "../../../../../packages/core/dynamics";
export function GET() {
  return new Response(
    JSON.stringify({
      ...dynamics,
      definitions: dynamicsMetrics,
      unit: "人",
      periodBasis: "暦年（1月〜12月）または暦月の届出による増減",
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}

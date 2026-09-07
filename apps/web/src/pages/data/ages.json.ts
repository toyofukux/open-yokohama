import { ages } from "../../ages-data";
import { ageMetrics } from "../../../../../packages/core/ages";
export function GET() {
  return new Response(
    JSON.stringify({
      ...ages,
      definitions: ageMetrics,
      periodBasis: "各年1月1日現在の推計人口",
      shareDenominator: "年齢不詳を含む総人口",
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}

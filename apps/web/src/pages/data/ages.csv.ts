import { ages } from "../../ages-data";
import { ageMetrics } from "../../../../../packages/core/ages";
import { geographies } from "../../data";
const escape = (s: string | number) => `"${String(s).replaceAll('"', '""')}"`;
export function GET() {
  const source = ages.snapshots[0];
  const header = [
    "geography_code",
    "geography",
    "metric",
    "value",
    "unit",
    "period",
    "period_basis",
    "source_url",
    "source_sha256",
    "source_rows",
    "source_column",
    "retrieved_at",
    "revision",
    "verification",
  ];
  const rows = ages.records.flatMap((r) =>
    ageMetrics.map((m) =>
      [
        r.geography,
        geographies.find((g) => g.code === r.geography)!.name,
        m.id,
        r.values[m.id],
        m.unit,
        r.period,
        "1月1日現在の推計人口",
        source.url,
        source.id,
        r.sourceRows[m.id].join(";"),
        r.column,
        source.retrievedAt,
        r.revision,
        r.status,
      ]
        .map(escape)
        .join(","),
    ),
  );
  return new Response(
    "\uFEFF" + header.join(",") + "\r\n" + rows.join("\r\n"),
    { headers: { "Content-Type": "text/csv; charset=utf-8" } },
  );
}

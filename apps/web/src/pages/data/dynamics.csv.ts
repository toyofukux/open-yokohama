import { dynamics } from "../../dynamics-data";
import { geographies } from "../../data";
const escape = (s: string | number) => `"${String(s).replaceAll('"', '""')}"`;
export function GET() {
  const header = [
    "geography_code",
    "geography",
    "metric",
    "value",
    "unit",
    "frequency",
    "period",
    "period_basis",
    "source_url",
    "source_sha256",
    "source_row",
    "source_column",
    "retrieved_at",
    "revision",
    "verification",
  ];
  const rows = dynamics.observations.map((o) => {
    const source = dynamics.snapshots.find((s) => s.id === o.sourceId)!;
    return [
      o.geography,
      geographies.find((g) => g.code === o.geography)!.name,
      o.metric,
      o.value,
      "人",
      o.frequency,
      o.period,
      o.frequency === "year" ? "暦年（1月〜12月）" : "暦月",
      source.url,
      source.sha256,
      o.row,
      o.column,
      source.retrievedAt,
      o.revision,
      o.status,
    ]
      .map(escape)
      .join(",");
  });
  return new Response(
    "\uFEFF" + header.join(",") + "\r\n" + rows.join("\r\n"),
    { headers: { "Content-Type": "text/csv; charset=utf-8" } },
  );
}

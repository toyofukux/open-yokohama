import { createHash } from "node:crypto";
import ageRaw from "../../../data/published/ages.json?raw";
import { flowStory, ageStory } from "../../../packages/core/region-story";
import { dynamics } from "./dynamics-data";
import { ages } from "./ages-data";
import { geographies } from "./data";
export const ageDataVersion = createHash("sha256").update(ageRaw).digest("hex");
export function movementStory(geography: string, end: number) {
  const name = geographies.find((g) => g.code === geography)!.name;
  const obs = dynamics.observations.filter(
    (o) =>
      o.geography === geography && o.frequency === "year" && +o.period <= end,
  );
  const years = [...new Set(obs.map((o) => o.period))].sort();
  const records = years.map((year) => {
    const get = (metric: string) =>
      obs.find((o) => o.period === year && o.metric === metric)!.value;
    return {
      year: +year,
      total: get("total_change"),
      natural: get("natural_change"),
      social: get("social_change"),
      population: ages.records.find(
        (r) => r.geography === geography && r.period === `${year}-01-01`,
      )?.values.age_total,
    };
  });
  const wards = dynamics.observations.filter(
    (o) =>
      o.geography !== "141003" &&
      o.frequency === "year" &&
      o.metric === "total_change" &&
      +o.period === end,
  );
  return flowStory(
    name,
    records,
    geography === "141003"
      ? {
          up: wards.filter((o) => o.value > 0).length,
          down: wards.filter((o) => o.value < 0).length,
          zero: wards.filter((o) => o.value === 0).length,
        }
      : undefined,
  );
}
export const ageStories = Object.fromEntries(
  geographies.map((g) => [
    g.code,
    ageStory(
      g.name,
      ages.records
        .filter((r) => r.geography === g.code)
        .map((r) => ({
          year: +r.period.slice(0, 4),
          total: r.values.age_total,
          child: r.values.age_under15,
          older: r.values.age_65plus,
          unknown: r.values.age_unknown,
        })),
    ),
  ]),
);

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { APIContext } from "astro";
const warehouseRoot = process.cwd();
import {
  loadRelease,
  pointer,
  publishedReleaseIds,
} from "../../../../../../packages/warehouse/storage";
import {
  articlePacket,
  articles,
} from "../../../../../../packages/warehouse/current";
export async function getStaticPaths() {
  const id = await pointer(warehouseRoot);
  if (!id) throw new Error("Missing release");
  const release = await loadRelease(warehouseRoot, id);
  const entries: { params: { path: string }; props: { text: string } }[] = [];
  const add = (path: string, data: unknown) =>
    entries.push({ params: { path }, props: { text: JSON.stringify(data) } });
  add("catalog.json", { releaseId: id, ...release.catalog });
  for (const shard of release.manifest.datasets)
    add(`${shard.id}.json`, {
      releaseId: id,
      observations: release.facts.filter((f) => f.dataset === shard.id),
    });
  for (const a of articles)
    add(`articles/${a.id.split("/")[1]}.json`, articlePacket(a.id));
  const objects = new Set<string>();
  for (const rid of await publishedReleaseIds(warehouseRoot)) {
    const old = await loadRelease(warehouseRoot, rid);
    add(`releases/${rid}/manifest.json`, old.manifest);
    for (const shard of old.manifest.datasets) objects.add(shard.object);
    for (const key of [
      "metadata",
      "catalog",
      "articles",
      "implementation",
    ] as const)
      objects.add(old.manifest[key]);
  }
  for (const object of objects)
    entries.push({
      params: { path: `objects/${object}.json` },
      props: {
        text: await readFile(
          resolve(warehouseRoot, "data/warehouse/objects", `${object}.json`),
          "utf8",
        ),
      },
    });
  return entries;
}
export function GET({ props }: APIContext) {
  return new Response(props.text, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

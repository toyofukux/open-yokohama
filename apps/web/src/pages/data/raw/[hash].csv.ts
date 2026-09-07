import { readFile } from "node:fs/promises";
import { currentCatalog } from "../../../../../../packages/warehouse/current";
export function getStaticPaths() {
  return currentCatalog.sources.map((s) => ({
    params: { hash: s.id },
    props: { path: s.path },
  }));
}
export async function GET({ props }: { props: { path: string } }) {
  return new Response(await readFile(props.path), {
    headers: { "Content-Type": "text/csv" },
  });
}

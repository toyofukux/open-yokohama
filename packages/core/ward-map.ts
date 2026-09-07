import assert from 'node:assert/strict';
import { type Band, comparisonBands } from './childcare';

export type WardGeometry = {
  code: string;
  slug: string;
  name: string;
  path: string;
  label: number[];
};
export type WardMapBase = { width: number; height: number; wards: WardGeometry[] };
export type WardMapValue = { code: string; label: string; band: Band };
export const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

/** Stable SVG: fixed geometry, explicit classes and labels; no time, network or randomness. */
export function renderWardMap(
  base: WardMapBase,
  values: WardMapValue[],
  title: string,
  description: string,
  colors: Partial<Record<Band, string>> = {},
) {
  assert.equal(base.wards.length, 18);
  assert.equal(new Set(base.wards.map((w) => w.code)).size, 18);
  assert.equal(new Set(values.map((v) => v.code)).size, values.length, 'Duplicate values');
  for (const value of values)
    assert.ok(
      base.wards.some((w) => w.code === value.code),
      'Unknown ward',
    );
  const paths = base.wards
    .map((ward) => {
      const value = values.find((v) => v.code === ward.code);
      const band = value?.band ?? 'missing';
      const fill =
        band === 'missing'
          ? 'url(#ward-map-missing)'
          : escapeXml(colors[band] ?? comparisonBands[band].color);
      assert.match(ward.path, /^[MLZ0-9.,-]+$/);
      return `<path data-ward="${ward.code}" data-band="${band}" d="${ward.path}" fill="${fill}" fill-rule="evenodd" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"><title>${escapeXml(ward.name)}：${escapeXml(value?.label ?? 'データなし')}</title></path>`;
    })
    .join('');
  const labels = base.wards
    .map((ward) => {
      const value = values.find((v) => v.code === ward.code);
      const [x, y] = ward.label;
      return `<g class="ward-map-label" transform="translate(${x} ${y})" text-anchor="middle" fill="#132c3a" font-family="Noto Sans JP,sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"><text font-size="${ward.name.length > 4 ? 19 : 22}" font-weight="700">${escapeXml(ward.name)}</text><text y="24" font-size="21">${escapeXml(value?.label ?? '—')}</text></g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${base.width} ${base.height}" width="${base.width}" height="${base.height}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><desc>${escapeXml(description)}</desc><defs><pattern id="ward-map-missing" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f4f4f4"/><path d="M0,8L8,0" stroke="#b7b7b7" stroke-width="1"/></pattern></defs>${paths}${labels}</svg>`;
}

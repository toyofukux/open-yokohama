/** Uniform JST calendar rotation. No profile, storage, random choice or timed slide change. */
export function featuredIndex(date: Date, count: number): number {
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(date.getTime())) {
    throw new Error('Valid date and positive item count required');
  }
  const day = Math.floor((date.getTime() + 9 * 60 * 60 * 1000) / 86400000);
  return ((day % count) + count) % count;
}
export const mayoralCampaign = {
  startsAt: '2026-09-07T00:00:00+09:00',
  endsAt: '2026-10-19T00:00:00+09:00',
};
export function campaignActive(date: Date): boolean {
  return (
    date.getTime() >= Date.parse(mayoralCampaign.startsAt) &&
    date.getTime() < Date.parse(mayoralCampaign.endsAt)
  );
}

import type { Settings, Stats } from "../core/types.ts";
export const emptyStats = (): Stats => ({ days: {}, domains: {}, log: [] });
export function prune(stats: Stats, now = Date.now()) {
  const cutoff = new Date(now - 29 * 86400000).toISOString().slice(0, 10);
  for (const date of Object.keys(stats.days))
    if (date < cutoff) delete stats.days[date];
  for (const date of Object.keys(stats.domainDays ?? {}))
    if (date < cutoff) delete stats.domainDays![date];
  const totals: Record<string, number> = {};
  for (const values of Object.values(stats.domainDays ?? {}))
    for (const [domain, count] of Object.entries(values))
      totals[domain] = (totals[domain] ?? 0) + count;
  stats.domains = Object.fromEntries(
    Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200),
  );
  return stats;
}
export function record(
  stats: Stats,
  settings: Pick<Settings, "statistics" | "requestLog">,
  domain: string,
  category: string,
  type: string,
  now = Date.now(),
) {
  if (settings.statistics) {
    const day = new Date(now).toISOString().slice(0, 10);
    stats.days[day] ??= {};
    stats.days[day][category] = (stats.days[day][category] ?? 0) + 1;
    if (category === "trackers") {
      stats.domainDays ??= {};
      stats.domainDays[day] ??= {};
      const d = stats.domainDays[day];
      d[domain] = (d[domain] ?? 0) + 1;
      stats.domainDays[day] = Object.fromEntries(
        Object.entries(d)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 200),
      );
    }
    prune(stats, now);
  }
  if (settings.requestLog) {
    stats.log.push({ time: now, domain, category, type });
    stats.log = stats.log.slice(-200);
  }
}

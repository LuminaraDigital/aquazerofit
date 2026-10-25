/**
 * Fight Camp kill-criteria report (AZF-P1 §7.3) from the admin metrics.
 *
 *   curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     "https://aquazerofit.com/api/v1/admin/engage/metrics?season=1" > metrics.json
 *   node tools/engage/kill-report.mjs metrics.json > kill-report.md
 *
 * Reads the `{ metrics }` body of GET /admin/engage/metrics and prints a
 * Markdown table: each Phase 1 feature, its rule, the measured value, and
 * KEEP, REDESIGN or NOT YET (a figure the data cannot support yet). It makes
 * no decision for anyone: it states the rule the PRD set and where the
 * numbers stand against it. The guardrails row (complaints, refunds,
 * platform warnings, counsel) is not measurable here and is always listed
 * for a person to check.
 *
 * Plain Node with no dependencies, outside the npm workspaces like the
 * other tools. `export`s the pure builder so it can be tested.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Thresholds from AZF-P1 §7.3. */
export const RULES = {
  shareRate: 0.03,
  shareToInstall: 0.02,
  squadLiftPts: 5,
  reenrolment: 0.3,
  earlyCheersAlpha: 0.05,
  earlyCheersMinPerArm: 400,
};

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);

/** One row per feature: [feature, rule, value, verdict]. */
export function killRows(m) {
  const rows = [];

  const share = m.share;
  const shareVerdict =
    share.shareRate === null || share.shareToInstall === null
      ? 'NOT YET'
      : share.shareRate >= RULES.shareRate && share.shareToInstall >= RULES.shareToInstall
        ? 'KEEP'
        : 'REDESIGN';
  rows.push([
    'Share Kit',
    'share rate >= 3% of WAU and share-to-install >= 2% (28 days)',
    `share rate ${pct(share.shareRate)} (${share.sharers}/${share.weeklyActive}); share-to-install ${pct(share.shareToInstall)} (${share.attributed28d}/${share.landed28d})`,
    shareVerdict,
  ]);

  const sq = m.squads;
  rows.push([
    'Squads',
    'D30 retention >= 5 pts above matched solo users',
    `squad ${pct(sq.squadD30)} (${sq.squadUsers}) vs solo ${pct(sq.soloD30)} (${sq.soloUsers}); lift ${sq.liftPts ?? 'n/a'} pts`,
    sq.liftPts === null ? 'NOT YET' : sq.liftPts >= RULES.squadLiftPts ? 'KEEP' : 'REDESIGN',
  ]);

  const re = m.reenrolment;
  rows.push([
    'Seasons (enrolment, recap)',
    `season N+1 re-enrolment >= 30% of season ${re.fromSeason} enrollees`,
    `${pct(re.rate)} (${re.reenrolled ?? 'n/a'}/${re.enrolled})`,
    re.rate === null ? 'NOT YET' : re.rate >= RULES.reenrolment ? 'KEEP' : 'REDESIGN (test a 6-week season, else retire enrolment)',
  ]);

  const ec = m.earlyCheers;
  const powered = ec.treatment.users >= RULES.earlyCheersMinPerArm && ec.holdout.users >= RULES.earlyCheersMinPerArm;
  const significant = ec.pValue !== null && ec.pValue < RULES.earlyCheersAlpha && (ec.liftPts ?? 0) > 0;
  rows.push([
    'Early cheers',
    'week-1 completion lift at p < 0.05, with >= 400 per arm',
    `treatment ${ec.treatment.completed}/${ec.treatment.users}, holdout ${ec.holdout.completed}/${ec.holdout.users}; lift ${ec.liftPts ?? 'n/a'} pts, p = ${ec.pValue ?? 'n/a'}`,
    !powered ? 'NOT YET' : significant ? 'KEEP' : 'REDESIGN (turn coach cheers off, keep member cheers)',
  ]);

  rows.push([
    'Any Phase 1 feature',
    'complaints or refunds up > 1 pt, any platform warning, any counsel concern: flag that feature off at once',
    `not measured here; cheers per sender this season: max ${m.guardrails.maxPerSender}, p95 ${m.guardrails.p95PerSender}`,
    'CHECK BY HAND',
  ]);
  return rows;
}

export function killReport(m) {
  const lines = [
    `# Fight Camp kill-criteria report`,
    '',
    `Season ${m.season.number} (${m.season.name}, ${m.season.startsOn} to ${m.season.endsOn}), measured ${m.today}.`,
    '',
    '| Feature | Rule (AZF-P1 §7.3) | Measured | Verdict |',
    '|---|---|---|---|',
    ...killRows(m).map((r) => `| ${r.join(' | ')} |`),
    '',
    `Cut Man: ${m.grace.applied} days applied across ${m.grace.activeUsers} active people (${m.grace.appliedPerActiveUser ?? 'n/a'} each).`,
    '',
    'NOT YET means the data cannot support a decision yet (a cohort inside its 30 days, an arm under 400 people, no landings). A verdict here is the PRD rule applied to these numbers; the decision is the founder’s.',
    '',
  ];
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/engage/kill-report.mjs <metrics.json>');
    process.exit(2);
  }
  const body = JSON.parse(await readFile(file, 'utf8'));
  process.stdout.write(killReport(body.metrics ?? body));
}

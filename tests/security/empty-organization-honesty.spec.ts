// tests/security/empty-organization-honesty.spec.ts
//
// ---------------------------------------------------------------------
// THE FIRST FIVE MINUTES
// ---------------------------------------------------------------------
// The database was reset, so every customer's first session is against a
// genuinely empty organisation. That session is the one where they
// decide whether the product does anything.
//
// The audit of that path found the same defect eleven times, in two
// shapes:
//
//   FABRICATED VERDICT   a metric computed over nothing, rendered as a
//                        measurement -- "0/100 fleet health", "0.0%
//                        completion rate", "60/100 composite ESG score"
//
//   UNEARNED REASSURANCE an empty subsystem reported as a healthy one --
//                        "your fleet is up to date", a green tick over
//                        five subsystems that were never populated
//
// Both tell a new customer that everything is fine, which is precisely
// why nothing prompts them to set anything up.
//
// The behavioural halves of this are asserted where they belong
// (honest-metrics.spec.ts for the scores, esg-export-scope.spec.ts for
// the disclosure, empty-state-copy.spec.ts for the copy decisions). What
// is asserted HERE is that the render sites are actually wired to those
// decisions -- because each fix is one line at a call site, and a call
// site is exactly what gets lost in a later refactor.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Comments are stripped before matching. Every fix in this round carries
 * a comment QUOTING the sentence it removed -- that is how the next
 * engineer knows why the branch exists -- so a naive substring search
 * finds the old copy in the explanation of its own removal.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const read = (rel: string) => stripComments(readRaw(rel));

describe('the setup checklist is reachable by the account that can act on it', () => {
  it('GetStartedPanel is mounted on BOTH dashboards', () => {
    /*
      app/(protected)/dashboard/page.tsx routes anyone holding ORG_MANAGE
      to OrganizationDashboardPage and everyone else to
      FleetDashboardPage. The panel was mounted only on the second --
      and the roles holding ORG_MANAGE are exactly the roles holding all
      four of the checklist's anchor permissions. So the checklist was
      unreachable by the only accounts able to complete it: an owner
      opening a brand-new organisation saw member counts and a billing
      card, and nothing telling them to add a vehicle.
    */
    for (const rel of [
      'frontend/modules/dashboard/pages/FleetDashboardPage.tsx',
      'frontend/modules/organizations/pages/OrganizationDashboardPage.tsx',
    ]) {
      expect({ page: rel, mounts: read(rel).includes('<GetStartedPanel />') }).toEqual({
        page: rel,
        mounts: true,
      });
    }
  });

  it('the router still sends ORG_MANAGE holders to the organisation dashboard', () => {
    // If this ever changes, the assertion above stops meaning what it
    // says -- so the routing premise is pinned alongside it.
    const router = read('app/(protected)/dashboard/page.tsx');
    expect(router).toMatch(/Permission\.ORG_MANAGE/);
    expect(router).toMatch(/OrganizationDashboardPage/);
  });
});

describe('no surface congratulates an organisation with no fleet', () => {
  const SHIPPED_LIES: Array<{ file: string; phrase: string }> = [
    {
      file: 'frontend/shared/dashboards/widgets/MaintenanceWidget.tsx',
      phrase: 'your fleet is up to date',
    },
    {
      file: 'frontend/shared/dashboards/widgets/NeedsAttentionWidget.tsx',
      phrase: 'your fleet is in good shape',
    },
  ];

  it.each(SHIPPED_LIES)('$file no longer hard-codes its reassurance', ({ file, phrase }) => {
    expect({ file, phrase, present: read(file).toLowerCase().includes(phrase) }).toEqual({
      file,
      phrase,
      present: false,
    });
  });

  it('the widgets and the queue all derive their empty copy from one place', () => {
    // Five call sites previously phrased this five ways. One table is
    // how a sixth stays consistent.
    for (const rel of [
      'frontend/shared/dashboards/widgets/MaintenanceWidget.tsx',
      'frontend/shared/dashboards/widgets/NeedsAttentionWidget.tsx',
      'frontend/modules/attention/components/AttentionQueueList.tsx',
    ]) {
      const src = read(rel);
      expect({ file: rel, usesCopy: src.includes('emptyCopy(') }).toEqual({
        file: rel,
        usesCopy: true,
      });
      expect({ file: rel, usesPresence: src.includes('useFleetPresence') }).toEqual({
        file: rel,
        usesPresence: true,
      });
    }
  });

  it('a zero is not painted green unless a fleet exists for it to be about', () => {
    for (const rel of [
      'frontend/shared/dashboards/widgets/KPIsWidget.tsx',
      'frontend/modules/attention/pages/CommandCentrePage.tsx',
    ]) {
      const src = read(rel);
      expect({ file: rel, gated: src.includes('zeroTone(') }).toEqual({ file: rel, gated: true });
      // and the unconditional form is gone
      expect({ file: rel, unconditional: /> 0 \? '(critical|attention)' : 'positive'/.test(src) }).toEqual(
        { file: rel, unconditional: false }
      );
    }
  });

  it('"All invitations resolved" is not shown to an organisation that sent none', () => {
    const grid = read('frontend/modules/organizations/components/dashboard/OverviewStatsGrid.tsx');
    expect(grid).toMatch(/totalUsers > 1[\s\S]{0,120}All invitations resolved/);
    expect(grid).toMatch(/Invite your team/);
  });
});

describe('a failed request never renders as a measurement', () => {
  it('the stat-card adapters forward error and emptyValue to MetricCard', () => {
    /*
      `MetricCard` has supported both since the card consolidation, but
      neither adapter passed them on -- so all 26 call sites behind them
      were structurally incapable of distinguishing a failed request
      from a real zero, however carefully they were written.
    */
    for (const rel of [
      'shared/ui/cards/StatsCard.tsx',
      'frontend/shared/ui/data-display/StatisticCards.tsx',
    ]) {
      const src = read(rel);
      expect({ file: rel, error: /error=\{error\}/.test(src) }).toEqual({ file: rel, error: true });
      expect({ file: rel, empty: /emptyValue=\{emptyValue\}/.test(src) }).toEqual({
        file: rel,
        empty: true,
      });
    }
  });

  it('the stat rows that ignored isError now read it', () => {
    for (const rel of [
      'frontend/modules/vehicles/components/VehicleStatsCards.tsx',
      'frontend/modules/maintenance/components/MaintenanceStatsCards.tsx',
      'frontend/modules/organizations/components/dashboard/OverviewStatsGrid.tsx',
      'frontend/modules/organizations/components/dashboard/UsageCard.tsx',
    ]) {
      expect({ file: rel, reads: /isError/.test(read(rel)) }).toEqual({ file: rel, reads: true });
    }
  });

  it('VehicleStatsCards no longer defaults its four figures to zero', () => {
    // `data?.total ?? 0` printed four confident zeroes over an outage,
    // including a green "Active: 0", directly above the page's own
    // correct empty state.
    const src = read('frontend/modules/vehicles/components/VehicleStatsCards.tsx');
    expect(src).not.toMatch(/data\?\.\w+ \?\? 0/);
  });

  it('the organisation dashboard stops shimmering when its stats fail', () => {
    // `isLoading || !statistics` swallowed a failure into the skeleton
    // branch: a permanent shimmer, indistinguishable from a slow network.
    for (const rel of [
      'frontend/modules/organizations/components/dashboard/OverviewStatsGrid.tsx',
      'frontend/modules/organizations/components/dashboard/UsageCard.tsx',
    ]) {
      expect(read(rel)).toMatch(/if \(isError \|\| \(!isLoading && !statistics\)\)/);
    }
  });
});

describe('a chart that failed to load does not report "no data"', () => {
  /*
    Thirty-seven components shared `if (error || !data || data.length === 0)`
    and rendered one sentence for both. "No data available" over a 500 is
    a claim about the customer's data made on the strength of a failed
    request -- an operator reads "no trips in this range" and goes
    looking for a broken telematics feed.
  */
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  const COMPONENTS = walk(path.join(ROOT, 'frontend')).filter(
    (f) => f.includes(`${path.sep}components${path.sep}`)
  );

  it('found the components', () => {
    expect(COMPONENTS.length).toBeGreaterThan(100);
  });

  it('no component component ORs its error into a "no data" branch', () => {
    const offenders: string[] = [];

    for (const file of COMPONENTS) {
      const src = fs.readFileSync(file, 'utf8');
      const pattern = /(?:^|\W)(?:if \(|\) : )(?:error|isError) \|\| ([^\n]*?)(?:\) \{|\? \()/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(src))) {
        // The branch that follows. A guard whose body already says the
        // request failed is fine — several stat cards say exactly that.
        const body = src.slice(match.index, match.index + 400).toLowerCase();
        const saysNoData = /no data|no \w+ (in|for|recorded|logged)|not enough|nothing to/.test(body);
        const saysFailed = /unable to load|couldn't load|could not load|failed to load/.test(body);
        if (saysNoData && !saysFailed) {
          offenders.push(
            `${path.relative(ROOT, file)}:${src.slice(0, match.index).split('\n').length}`
          );
        }
      }
    }

    expect({ errorRenderedAsEmpty: offenders }).toEqual({ errorRenderedAsEmpty: [] });
  });

  it('ChartLoadError says the absence of a result proves nothing', () => {
    const src = read('frontend/shared/ui/ChartLoadError.tsx');
    expect(src).toMatch(/not a report that there is no data/i);
    // status, not alert: several can appear on one screen, and a chart
    // that failed to load is not an interruption (WCAG 2.2 SC 4.1.3).
    expect(src).toMatch(/role="status"/);
    expect(src).not.toMatch(/role="alert"/);
  });
});

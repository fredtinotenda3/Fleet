// frontend/modules/organizations/pages/OrganizationAdvancedPage.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/frontend/shared/ui/navigation/tabs';
import { FeatureFlagsSection } from '../components/advanced/FeatureFlagsSection';
import { AISettingsSection } from '../components/advanced/AISettingsSection';
import { ReportingPreferencesSection } from '../components/advanced/ReportingPreferencesSection';
import { PluginSettingsSection } from '../components/advanced/PluginSettingsSection';
import { BillingPlansSection } from '../components/advanced/BillingPlansSection';
import { InvoiceHistoryTable } from '../components/advanced/InvoiceHistoryTable';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { canManageBilling, canManageMembers } from '../utils';
import { ORGANIZATION_ROUTES } from '../routes';

const TABS = [
  { value: 'feature-flags', label: 'Feature flags' },
  { value: 'billing', label: 'Billing' },
  { value: 'plugins', label: 'Plugins' },
  { value: 'ai', label: 'AI' },
  { value: 'reporting', label: 'Reporting' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

function isTabValue(value: string | null): value is TabValue {
  return TABS.some((t) => t.value === value);
}

export function OrganizationAdvancedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { organization, currentUserRole, isLoading } = useCurrentOrganization(user?.id);

  /*
    ?tab= WAS DECLARED AND IGNORED.

    ORGANIZATION_ROUTES.advanced exposes a deep link for all five tabs
    (`/organizations/advanced?tab=plugins` and four siblings) and this
    page initialised `useState('feature-flags')` and never read
    searchParams. Every one of those links silently landed on Feature
    flags -- including the sidebar's "API Keys" entry, which pointed
    here and therefore took an administrator to the wrong tab of a page
    that does not contain API keys at all. (That entry now points at
    /organizations/api-keys, where the UI actually lives.)

    The parameter is also WRITTEN BACK on change, so the tab a person is
    looking at is the tab they can bookmark, share or reload into --
    which is what a query parameter in a route constant implies.
    `router.replace` with `scroll: false` keeps it out of the history
    stack: tab changes are not navigations a Back button should undo.
  */
  const initialTab: TabValue = isTabValue(searchParams.get('tab'))
    ? (searchParams.get('tab') as TabValue)
    : 'feature-flags';
  const [tab, setTab] = useState<TabValue>(initialTab);

  const selectTab = (value: TabValue) => {
    setTab(value);
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', value);
    router.replace(`${ORGANIZATION_ROUTES.advanced.root}?${next.toString()}`, { scroll: false });
  };

  if (isLoading || !organization) {
    return <PageLoader label="Loading advanced administration" />;
  }

  const role = currentUserRole ?? 'viewer';
  if (!canManageMembers(role)) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Only organization owners and fleet managers can manage advanced administration."
        action={{ label: 'Back to dashboard', onClick: () => router.push(ORGANIZATION_ROUTES.dashboard) }}
      />
    );
  }

  return (
    <div className="p-6 mx-auto space-y-6 max-w-form-wide">
      <PageHeader
        title="Advanced administration"
        description={`Feature flags, billing, plugins, AI models, and reporting defaults for ${organization.name}.`}
      />

      <Tabs value={tab} onValueChange={(v) => selectTab(v as TabValue)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="feature-flags">
          <FeatureFlagsSection organization={organization} />
        </TabsContent>

        <TabsContent value="billing">
          {canManageBilling(role) ? (
            <div className="space-y-6">
              <BillingPlansSection organization={organization} />
              <div>
                <h3 className="mb-3 text-h3">Invoice history</h3>
                <InvoiceHistoryTable />
              </div>
            </div>
          ) : (
            <EmptyState title="Owners only" description="Only the organization owner can manage billing." />
          )}
        </TabsContent>

        <TabsContent value="plugins">
          <PluginSettingsSection />
        </TabsContent>

        <TabsContent value="ai">
          <AISettingsSection organization={organization} />
        </TabsContent>

        <TabsContent value="reporting">
          <ReportingPreferencesSection organization={organization} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
// frontend/modules/organizations/pages/OrganizationAdvancedPage.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
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

export function OrganizationAdvancedPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { organization, currentUserRole, isLoading } = useCurrentOrganization(user?.id);
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('feature-flags');

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
      <div>
        <h1 className="text-h1">Advanced administration</h1>
        <p className="text-muted-foreground text-body-sm">
          Feature flags, billing, plugins, AI models, and reporting defaults for {organization.name}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
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
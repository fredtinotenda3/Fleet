// frontend/modules/organizations/pages/OrganizationSettingsPage.tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth'; // ✅ Import the auth hook
import { useCurrentOrganization } from '../hooks';
import { useOrganizationSettings } from '../hooks/useOrganizationSettings';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/frontend/shared/ui/navigation/tabs';
import { GeneralInfoSection } from '../components/settings/GeneralInfoSection';
import { BrandingSection } from '../components/settings/BrandingSection';
import { ContactSection } from '../components/settings/ContactSection';
import { RegionalSection } from '../components/settings/RegionalSection';
import { BusinessHoursSection } from '../components/settings/BusinessHoursSection';
import { TaxSection } from '../components/settings/TaxSection';
import { PageLoader } from '@/frontend/shared/loading/PageLoader';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'branding', label: 'Branding' },
  { value: 'contact', label: 'Contact & Address' },
  { value: 'regional', label: 'Regional' },
  { value: 'hours', label: 'Business Hours' },
  { value: 'tax', label: 'Tax' },
] as const;

export function OrganizationSettingsPage() {
  const { user } = useAuth(); // Gets { id, email, roles, tenantId }
  const { organization, isLoading } = useCurrentOrganization(user?.id); // ✅ Passes user.id
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('general');

  // ✅ Hook called before any conditional returns
  const mutations = useOrganizationSettings(organization?._id ?? '');

  if (isLoading || !organization) {
    return <PageLoader label="Loading organization settings" />;
  }

  return (
    <div className="p-6 mx-auto space-y-6 max-w-form-wide">
      <div>
        <h1 className="text-h1">Organization Settings</h1>
        <p className="text-muted-foreground text-body-sm">
          Manage {organization.name}&apos;s profile, branding, and operational configuration.
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

        <TabsContent value="general">
          <GeneralInfoSection organization={organization} mutation={mutations.updateGeneralInfo} />
        </TabsContent>
        <TabsContent value="branding">
          <BrandingSection
            organization={organization}
            mutation={mutations.updateBranding}
            uploadLogo={mutations.uploadLogo}
          />
        </TabsContent>
        <TabsContent value="contact">
          <ContactSection organization={organization} mutation={mutations.updateContactDetails} />
        </TabsContent>
        <TabsContent value="regional">
          <RegionalSection organization={organization} mutation={mutations.updateRegionalSettings} />
        </TabsContent>
        <TabsContent value="hours">
          <BusinessHoursSection organization={organization} mutation={mutations.updateBusinessHours} />
        </TabsContent>
        <TabsContent value="tax">
          <TaxSection organization={organization} mutation={mutations.updateTaxSettings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
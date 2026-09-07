// frontend/modules/organizations/pages/OrganizationSelectPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { OrganizationCard } from '../components/OrganizationCard';
import { CreateOrganizationDialog } from '../components/CreateOrganizationDialog';
import { useCurrentOrganization } from '../hooks/useCurrentOrganization';
import { ORGANIZATION_ROUTES } from '../routes';

interface OrganizationSelectPageProps {
  currentUserId: string;
}

export function OrganizationSelectPage({ currentUserId }: OrganizationSelectPageProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { organizations, switchOrganization, isLoading } = useCurrentOrganization(currentUserId);

  const filtered = useMemo(() => {
    if (!search.trim()) return organizations;
    const q = search.toLowerCase();
    return organizations.filter((o) => o.name.toLowerCase().includes(q));
  }, [organizations, search]);

  function handleSelect(organizationId: string) {
    switchOrganization(organizationId);
    router.push(ORGANIZATION_ROUTES.dashboard);
  }

  return (
    <div className="max-w-3xl px-4 py-10 mx-auto sm:px-6">
      <PageHeader
        className="mb-6"
        title="Your organizations"
        description="Choose an organization to continue, or create a new one."
        actions={
          <CreateOrganizationDialog
            onCreated={handleSelect}
            trigger={
              <Button>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                New organization
              </Button>
            }
          />
        }
      />

      {organizations.length > 0 && (
        <div className="relative mb-4">
          <Search
            className="absolute w-4 h-4 -translate-y-1/2 pointer-events-none left-3 top-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organizations"
            aria-label="Search organizations"
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading organizations">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-full h-20 skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={organizations.length === 0 ? 'No organizations yet' : 'No matches found'}
          description={
            organizations.length === 0
              ? 'Create your first organization to start managing your fleet.'
              : 'Try a different search term.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((org) => (
            <OrganizationCard key={org.id} organization={org} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
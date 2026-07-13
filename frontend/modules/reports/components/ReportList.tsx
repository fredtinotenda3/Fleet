// frontend/modules/reports/components/ReportList.tsx

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Star, Trash2, Search } from 'lucide-react';
import { useSavedReports } from '../hooks/useSavedReports';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { REPORTS_ROUTES } from '../routes';

export function ReportList() {
  const router = useRouter();
  const {
    reports,
    templates,
    isLoading,
    isError,
    search,
    setSearch,
    isFavorite,
    toggleFavorite,
    duplicate,
    isDuplicating,
    remove,
    isRemoving,
    instantiateTemplate,
  } = useSavedReports();

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (isLoading) return <LoadingState />;
  if (isError) return <EmptyState title="Couldn't load saved reports" description="Please try again." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved reports…"
            className="w-full py-2 pl-8 pr-3 text-sm border rounded-md bg-background"
          />
        </div>
        <Link
          href={REPORTS_ROUTES.builder.new}
          className="px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap bg-primary text-primary-foreground hover:opacity-90"
        >
          New report
        </Link>
      </div>

      {templates.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Start from a template</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(templates as unknown as Array<{ id: string; name: string; description?: string }>).map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => instantiateTemplate({ templateId: template.id })}
                className="p-3 text-sm text-left border rounded-md hover:bg-accent"
              >
                <p className="font-medium">{template.name}</p>
                {template.description && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {reports.length === 0 ? (
        <EmptyState
          title="No saved reports yet"
          description="Build a custom report or start from a template above."
          action={{ label: 'New report', onClick: () => router.push(REPORTS_ROUTES.builder.new) }}
        />
      ) : (
        <ul className="border divide-y rounded-md">
          {reports.map((report) => (
            <li key={report.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => toggleFavorite(report.id)}
                aria-label={isFavorite(report.id) ? 'Unfavorite' : 'Favorite'}
                className="text-muted-foreground hover:text-yellow-500"
              >
                <Star className={`h-4 w-4 ${isFavorite(report.id) ? 'fill-yellow-400 text-yellow-500' : ''}`} />
              </button>

              <Link href={REPORTS_ROUTES.builder.edit(report.id)} className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{report.name}</p>
                {report.description && (
                  <p className="text-xs truncate text-muted-foreground">{report.description}</p>
                )}
              </Link>

              {report.isShared && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Shared</span>
              )}

              <button
                type="button"
                onClick={() => duplicate(report.id)}
                disabled={isDuplicating}
                className="rounded-md p-1.5 hover:bg-accent disabled:opacity-50"
                aria-label="Duplicate report"
                title="Duplicate"
              >
                <Copy className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setPendingDeleteId(report.id)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                aria-label="Delete report"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
          <div className="w-full max-w-sm p-5 border rounded-lg shadow-lg bg-background">
            <h2 className="text-base font-semibold">Delete this report?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This can&apos;t be undone. Any schedule attached to it will also be removed.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="px-3 py-2 text-sm font-medium border rounded-md hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={async () => {
                  await remove(pendingDeleteId);
                  setPendingDeleteId(null);
                }}
                className="px-3 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground disabled:opacity-50"
              >
                {isRemoving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
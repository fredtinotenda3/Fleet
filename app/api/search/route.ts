// app/api/search/route.ts
//
// Global record search, backing the Ctrl/Cmd-K palette.
//
// Authenticated but carrying no single permission: the service checks
// the right permission for each source it queries, because one
// route-level permission would be either too narrow (a driver could not
// find a vehicle they are allowed to see) or too wide (unlocking six
// collections behind one check).

import { NextRequest } from 'next/server';
import { searchController } from '@/modules/search/controllers/search.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const GET = withAuth((req: NextRequest) => searchController.search(req));

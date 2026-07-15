// app/api/fuellogs/receipt/route.ts
//
// FIX (🔴 Critical — no authentication at all): this route called
// getTenantFromRequest()/getUserIdFromRequest() directly with no
// withAuth wrapper anywhere in the request path, and never checked
// whether either call actually resolved a caller. Every other route
// in the codebase that uses these two helpers (meterlogs/last,
// fuel-cards, expense-types, trips/[id]) only calls them from INSIDE
// an already-wrapped withAuth(...) handler — the helpers are a
// convenience accessor for context withAuth has already established,
// not an auth check themselves. Called standalone like this, an
// unauthenticated caller could POST a file, tenantId/userId would
// resolve to null/undefined, and the handler would still write the
// file to disk and return 200 with a public URL — an open,
// unauthenticated file-upload endpoint. Fixed by wrapping in
// withAuth + Permission.FUEL_CREATE, matching the fix already applied
// to app/api/fuel-cards/route.ts for the same class of gap.
//
// Storage note (unchanged from original): stores under
// public/uploads/receipts and returns a public URL. This is a
// local-disk implementation, chosen because this module doesn't have
// visibility into infrastructure/storage/storage.service.ts's exact
// method signatures — guessing at that interface risked a
// non-compiling import. Deployments on ephemeral/serverless
// filesystems (e.g. Vercel) should swap the fs.writeFile call below
// for that service once its interface is confirmed; every other layer
// (validation, the returned { url } shape, the frontend hook) is
// already storage-agnostic.

import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'receipts');

export const POST = withAuth(
  async (req: NextRequest) => {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
    

      // withAuth already rejects unauthenticated requests before this
      // handler runs, but these are still validated defensively — if
      // either resolves empty, something upstream is broken and the
      // upload must not proceed with an unscoped/unattributed file.
      if (!tenantId || !userId) {
        return errorResponse('Unable to resolve authenticated context', 'UNAUTHORIZED', 401);
      }

      const formData = await req.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        return errorResponse('No file provided', 'VALIDATION_ERROR', 400);
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        return errorResponse('Unsupported file type. Use JPG, PNG, WEBP, or PDF.', 'VALIDATION_ERROR', 400);
      }
      if (file.size > MAX_SIZE_BYTES) {
        return errorResponse('File exceeds the 8MB limit.', 'VALIDATION_ERROR', 400);
      }

      const extension = path.extname(file.name) || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
      const filename = `${tenantId}-${randomUUID()}${extension}`;
      const destination = path.join(UPLOAD_DIR, filename);

      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(destination, buffer);

      const url = `/uploads/receipts/${filename}`;

      return successResponse({ url, uploadedBy: userId });
    } catch (error) {
      console.error('[FuelReceiptUpload] Unexpected error:', error);
      return errorResponse('Failed to upload receipt', 'INTERNAL_ERROR', 500);
    }
  },
  { permission: Permission.FUEL_CREATE }
);
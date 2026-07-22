// shared/export/export-response.utils.ts
//
// Turns an ExportFile + ExportMeta into the actual NextResponse every
// export route returns. Centralizing this means every module's export
// endpoint sends identical headers (Content-Disposition, truncation
// metadata, security headers) -- a module controller never constructs
// a NextResponse for a file download by hand.

import { NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';
import type { ExportFile, ExportMeta } from './export.types';

/**
 * FUTURE READINESS: the X-Export-* headers below are the extension
 * point background export jobs / export history (Phase 3+) will read
 * from -- a job runner can persist these fields per export instead of
 * only surfacing them on the synchronous response, without changing
 * this function's contract.
 */
export function fileDownloadResponse(file: ExportFile, meta: ExportMeta): NextResponse {
  const response = new NextResponse(file.buffer, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.buffer.length),
      'X-Export-Total-Matched': String(meta.totalMatched),
      'X-Export-Rows-Exported': String(meta.rowsExported),
      'X-Export-Truncated': String(meta.truncated),
      'X-Export-Cap': String(meta.exportCap),
      'Cache-Control': 'no-store',
    },
  });

  return applySecurityHeaders(response) as NextResponse;
}
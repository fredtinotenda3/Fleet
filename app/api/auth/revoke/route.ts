// app/api/auth/revoke/route.ts

import { NextRequest } from 'next/server';
import { tokenController } from '@/modules/security/controllers/token.controller';

export async function POST(req: NextRequest) {
  return tokenController.revoke(req);
}
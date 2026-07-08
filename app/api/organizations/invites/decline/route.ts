// app/api/organizations/invites/decline/route.ts
import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';

export async function POST(req: NextRequest) {
  return organizationController.declineInvite(req);
}
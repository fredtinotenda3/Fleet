// app/api/organizations/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';

export async function GET(req: NextRequest) {
  return organizationController.getMyOrganizations(req);
}

export async function POST(req: NextRequest) {
  return organizationController.createOrganization(req);
}
// app/api/organizations/[id]/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return organizationController.getOrganization(req, id);
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return organizationController.updateOrganization(req, id);
}
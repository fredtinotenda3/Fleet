// app/api/platform/organizations/[id]/route.ts

import { NextRequest } from 'next/server';
import { platformController } from '@/modules/tenancy/controllers/platform.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return platformController.getOrganization(req, id);
}
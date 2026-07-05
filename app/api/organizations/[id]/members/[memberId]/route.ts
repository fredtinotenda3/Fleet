// app/api/organizations/[id]/members/[memberId]/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';

interface RouteParams {
  params: Promise<{ id: string; memberId: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id, memberId } = await params;
  return organizationController.updateMemberRole(req, id, memberId);
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id, memberId } = await params;
  return organizationController.removeMember(req, id, memberId);
}
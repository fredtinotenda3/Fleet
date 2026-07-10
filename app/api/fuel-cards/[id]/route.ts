// app/api/fuel-cards/[id]/route.ts

import { NextRequest } from 'next/server';
import { fuelCardController } from '@/modules/fuel-cards/controllers/fuel-card.controller';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fuelCardController.getById(req, id);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fuelCardController.update(req, id);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fuelCardController.remove(req, id);
}
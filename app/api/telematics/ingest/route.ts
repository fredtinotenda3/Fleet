// app/api/telematics/ingest/route.ts

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';

export async function POST(req: NextRequest) {
  return telematicsController.ingest(req);
}
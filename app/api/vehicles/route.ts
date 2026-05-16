// C:\Users\user\Desktop\Fleet\app\api\vehicles\route.ts

// app/api/vehicles/route.ts

import { NextRequest } from 'next/server';
import { VehicleController } from '@/modules/vehicles/controllers/vehicle.controller';

const vehicleController = new VehicleController();

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  
  if (id) {
    return vehicleController.getVehicle(req, id);
  }
  
  const licensePlate = req.nextUrl.searchParams.get('license_plate');
  if (licensePlate) {
    return vehicleController.getVehicleByLicensePlate(req);
  }
  
  const action = req.nextUrl.searchParams.get('action');
  if (action === 'stats') {
    return vehicleController.getVehicleStats(req);
  }
  
  if (action === 'search') {
    return vehicleController.searchVehicles(req);
  }
  
  if (action === 'by-status') {
    return vehicleController.getVehiclesByStatus(req);
  }
  
  if (action === 'due-service') {
    return vehicleController.getVehiclesDueForService(req);
  }
  
  if (action === 'analytics') {
    return vehicleController.getVehicleAnalytics(req);
  }
  
  return vehicleController.getVehicles(req);
}

export async function POST(req: NextRequest) {
  console.log('POST /api/vehicles - Request received');
  return vehicleController.createVehicle(req);
}

export async function PUT(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return vehicleController.createVehicle(req);
  }
  
  const action = req.nextUrl.searchParams.get('action');
  if (action === 'status') {
    return vehicleController.updateVehicleStatus(req, id);
  }
  
  return vehicleController.updateVehicle(req, id);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return new Response('Bad Request: Missing vehicle ID', { status: 400 });
  }
  return vehicleController.deleteVehicle(req, id);
}
// C:\Users\user\Desktop\Fleet\app\api\vehicles\direct\route.ts

import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { requireAuth } from '@/lib/requireAuth';

export async function POST(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const body = await req.json();
    console.log('Direct create vehicle:', body);
    
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      return NextResponse.json({ error: 'MONGODB_URI not set' }, { status: 500 });
    }
    
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('VehicleExpense');
    
    const vehicleData = {
      license_plate: body.license_plate.toUpperCase(),
      make: body.make,
      model: body.model,
      year: body.year,
      vehicle_type: body.vehicle_type,
      purchase_date: body.purchase_date,
      fuel_type: body.fuel_type,
      color: body.color || '#3b82f6',
      status: body.status || 'active',
      tenantId: 'default',
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    
    const result = await db.collection('tblvehicles').insertOne(vehicleData);
    await client.close();
    
    return NextResponse.json({ 
      success: true, 
      data: { ...vehicleData, _id: result.insertedId } 
    }, { status: 201 });
    
  } catch (error) {
    console.error('Direct create error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
// C:\Users\user\Desktop\Fleet\app\api\test-vehicle\route.ts

import { NextRequest, NextResponse } from 'next/server';
import { vehicleCreateSchema } from '@/shared/validations/vehicle.schema';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Testing vehicle data:', body);
    
    const result = vehicleCreateSchema.safeParse(body);
    
    if (!result.success) {
      console.error('Validation errors:', result.error.errors);
      return NextResponse.json({
        success: false,
        errors: result.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// Add GET for easy testing
export async function GET() {
  return NextResponse.json({
    message: 'Use POST method to test vehicle validation',
    example: {
      license_plate: "TEST123",
      make: "Toyota",
      model: "Camry",
      year: 2024,
      vehicle_type: "Car",
      purchase_date: "2024-01-01",
      fuel_type: "Petrol",
      status: "active"
    }
  });
}
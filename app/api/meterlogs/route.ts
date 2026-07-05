// app/api/meterlogs/route.ts

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { requireAuth } from '@/lib/requireAuth';

const COLLECTION = 'tblmeterlogs';

export async function GET(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = req.nextUrl;
    const db = await connectToDatabase();

    const license_plate = searchParams.get('license_plate');
    const search = searchParams.get('search') || '';
    const unitId = searchParams.get('unit_id');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const pageParam = searchParams.get('page');
    const paginated = !!pageParam;
    const page = parseInt(pageParam || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchStage: any = {};

    if (license_plate)
      matchStage.license_plate = license_plate.toUpperCase();
    if (search)
      matchStage.license_plate = { $regex: search, $options: 'i' };
    if (unitId) matchStage.unit_id = unitId;
    if (start || end) {
      matchStage.date = {};
      if (start) matchStage.date.$gte = new Date(start);
      if (end) matchStage.date.$lte = new Date(end);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const basePipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'tblvehicles',
          let: { logLicense: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$logLicense'] },
                isDeleted: { $ne: true },
              },
            },
          ],
          as: 'vehicle_info',
        },
      },
      { $match: { 'vehicle_info.0': { $exists: true } } },
      {
        $lookup: {
          from: 'tblunits',
          localField: 'unit_id',
          foreignField: 'unit_id',
          as: 'unit',
        },
      },
      { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },
      { $sort: { date: -1 } },
    ];

    if (paginated) {
      const [countResult, data] = await Promise.all([
        db
          .collection(COLLECTION)
          .aggregate([...basePipeline, { $count: 'total' }])
          .toArray(),
        db
          .collection(COLLECTION)
          .aggregate([
            ...basePipeline,
            { $skip: skip },
            { $limit: limit },
            { $project: { vehicle_info: 0 } },
          ])
          .toArray(),
      ]);

      const total = countResult[0]?.total ?? 0;

      return NextResponse.json(
        data.map((doc) => ({
          ...doc,
          _id: doc._id.toString(),
        })),
        {
          headers: { 'X-Total-Count': total.toString() },
        }
      );
    }

    const data = await db
      .collection(COLLECTION)
      .aggregate([
        ...basePipeline,
        { $project: { vehicle_info: 0 } },
      ])
      .toArray();

    return NextResponse.json(
      data.map((doc) => ({ ...doc, _id: doc._id.toString() }))
    );
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meter logs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const body = await req.json();
    const requiredFields = ['license_plate', 'date', 'odometer', 'unit_id'];
    const missing = requiredFields.filter((field) => !body[field]);

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: body.license_plate.toUpperCase(),
      isDeleted: { $ne: true },
    });

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehicle not found or deleted' },
        { status: 400 }
      );
    }

    const unit = await db
      .collection('tblunits')
      .findOne({ unit_id: body.unit_id, type: 'distance' });

    if (!unit) {
      return NextResponse.json(
        { error: 'Invalid distance unit' },
        { status: 400 }
      );
    }

    const odometer = Number(body.odometer);
    if (isNaN(odometer) || odometer < 0) {
      return NextResponse.json(
        { error: 'Odometer must be a non-negative number' },
        { status: 400 }
      );
    }

    const date = new Date(body.date);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    const insertData = {
      license_plate: body.license_plate.toUpperCase(),
      odometer,
      date,
      unit_id: body.unit_id,
      notes: body.notes || '',
      createdAt: new Date(),
    };

    const result = await db.collection(COLLECTION).insertOne(insertData);

    return NextResponse.json(
      {
        _id: result.insertedId.toString(),
        ...insertData,
        date: insertData.date.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to create meter log' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid log ID' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const db = await connectToDatabase();

    if (body.license_plate) {
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: body.license_plate.toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        return NextResponse.json(
          { error: 'Vehicle not found or deleted' },
          { status: 400 }
        );
      }
    }

    if (body.unit_id) {
      const unit = await db
        .collection('tblunits')
        .findOne({ unit_id: body.unit_id, type: 'distance' });
      if (!unit) {
        return NextResponse.json(
          { error: 'Invalid distance unit' },
          { status: 400 }
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (body.date) updateData.date = new Date(body.date);
    if (body.odometer !== undefined)
      updateData.odometer = Number(body.odometer);
    if (body.unit_id) updateData.unit_id = body.unit_id;
    if (body.license_plate)
      updateData.license_plate = body.license_plate.toUpperCase();
    if (body.notes !== undefined) updateData.notes = body.notes;

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Meter log not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT Error:', error);
    return NextResponse.json(
      { error: 'Failed to update meter log' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid log ID' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const result = await db
      .collection(COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Meter log not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete meter log' },
      { status: 500 }
    );
  }
}
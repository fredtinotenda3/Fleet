// app/api/meterlogs/route.ts
//
// FIX (ðŸ”´ Critical â€” tenant isolation): every method in this file
// (GET/POST/PUT/DELETE) queried tblmeterlogs and tblvehicles with no
// tenantId filter at all. requireAuth() only proves *a* session
// exists â€” it says nothing about which organization the caller
// belongs to. Concretely, before this fix:
//   - GET returned odometer logs for every organization mixed together
//   - POST would attach a new log to any vehicle matching a
//     license_plate, even one owned by a different tenant
//   - PUT/DELETE could mutate or remove any org's log by ID
// Every query below is now scoped to getTenantFromRequest(req), and
// every insert stamps tenantId, matching the tenant-scoped pattern
// used throughout modules/* (e.g. expense-type.repository.ts).

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { getTenantFromRequest } from '@/server/utils/context.utils';

// FIX (High — duplicate auth strategies): converted from legacy
// requireAuth() to withAuth + Permission, matching the rest of the
// mature modules. Tenant scoping (the Critical fix above) is unchanged.
// server/permissions/roles.ts has no dedicated meter-log permission,
// so this maps to Permission.VEHICLE_VIEW / VEHICLE_EDIT (odometer
// logs are vehicle telemetry) as a stopgap. Every role that can edit
// vehicles (fleet_manager, organization_owner, super_admin) can also
// log/adjust/delete odometer readings under this mapping — flag for a
// dedicated METER_LOG_* permission if finer-grained control is wanted
// (e.g. drivers logging readings without full vehicle-edit rights).

const COLLECTION = 'tblmeterlogs';

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = req.nextUrl;
    const tenantId = await getTenantFromRequest(req);
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
    const matchStage: any = { tenantId };

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
                tenantId,
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
}, { permission: Permission.VEHICLE_VIEW });

export const POST = withAuth(async (req: NextRequest) => {
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

    const tenantId = await getTenantFromRequest(req);
    const db = await connectToDatabase();

    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: body.license_plate.toUpperCase(),
      tenantId,
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
      tenantId,
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
}, { permission: Permission.VEHICLE_EDIT });

export const PUT = withAuth(async (req: NextRequest) => {
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
    const tenantId = await getTenantFromRequest(req);
    const db = await connectToDatabase();

    // Scope the existence check to this tenant so a caller can't probe
    // for / mutate another organization's log by ID.
    const existing = await db
      .collection(COLLECTION)
      .findOne({ _id: new ObjectId(id), tenantId });

    if (!existing) {
      return NextResponse.json(
        { error: 'Meter log not found' },
        { status: 404 }
      );
    }

    if (body.license_plate) {
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: body.license_plate.toUpperCase(),
        tenantId,
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
      .updateOne({ _id: new ObjectId(id), tenantId }, { $set: updateData });

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
}, { permission: Permission.VEHICLE_EDIT });

export const DELETE = withAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid log ID' },
        { status: 400 }
      );
    }

    const tenantId = await getTenantFromRequest(req);
    const db = await connectToDatabase();
    const result = await db
      .collection(COLLECTION)
      .deleteOne({ _id: new ObjectId(id), tenantId });

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
}, { permission: Permission.VEHICLE_EDIT });
# Database Collection Schema Sample

> Generated for project inspection. Sensitive fields redacted.

Total collections: 83

## tbltelematics_demo_state

Estimated record count: 0

_No records_

## tbltelematics_eagletrack_links

Estimated record count: 0

_No records_

## tbldvirinspections

Estimated record count: 0

_No records_

## tblworkshopbays

Estimated record count: 0

_No records_

## tbladmin

Estimated record count: 28

```json
[
  {
    "_id": {
      "buffer": {
        "0": 105,
        "1": 194,
        "2": 65,
        "3": 239,
        "4": 37,
        "5": 73,
        "6": 219,
        "7": 61,
        "8": 33,
        "9": 110,
        "10": 44,
        "11": 247
      }
    },
    "FirstName": "Stanley",
    "Email": "fredtinotenda3@gmail.com",
    "Password": "[REDACTED]",
    "createdAt": {},
    "Role": "super_admin",
    "permissions": [
      "*"
    ],
    "roles": [
      "super_admin"
    ],
    "updatedAt": {},
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "tenantRepairedAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 105,
        "1": 195,
        "2": 202,
        "3": 61,
        "4": 121,
        "5": 75,
        "6": 5,
        "7": 101,
        "8": 78,
        "9": 59,
        "10": 23,
        "11": 133
      }
    },
    "FirstName": "Tawanda",
    "Email": "accounts@willsgrove.co.zw",
    "Password": "[REDACTED]",
    "createdAt": {},
    "tenantAssignedAt": {},
    "tenantId": "willsgrove-farm-enterprises-9e80ed"
  }
]
```

## tblreminders

Estimated record count: 0

_No records_

## tblvalueledger

Estimated record count: 0

_No records_

## tblexternal_providers

Estimated record count: 0

_No records_

## tblworkflows

Estimated record count: 0

_No records_

## tblcompliancerules

Estimated record count: 0

_No records_

## tblrefreshtokens

Estimated record count: 256

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 120,
        "2": 43,
        "3": 12,
        "4": 82,
        "5": 232,
        "6": 102,
        "7": 150,
        "8": 43,
        "9": 159,
        "10": 19,
        "11": 91
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "userId": "6a74695060900c100f2a4ed0",
    "familyId": "8a0a6751-3cdf-4ded-a019-98d76d62dee3",
    "tokenHash": "[REDACTED]",
    "sessionId": "5a2b81b0-ec17-4e98-b764-49d9fce6ee55",
    "status": "active",
    "issuedAt": {},
    "expiresAt": {},
    "ipAddress": "196.27.107.212",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a74695060900c100f2a4ed0",
    "updatedBy": "6a74695060900c100f2a4ed0"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 120,
        "2": 45,
        "3": 84,
        "4": 157,
        "5": 209,
        "6": 198,
        "7": 68,
        "8": 174,
        "9": 236,
        "10": 192,
        "11": 109
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "userId": "6a7450cec180a23f95f2f87d",
    "familyId": "3fc75f9c-8fd7-4b43-88e9-b1787bab9013",
    "tokenHash": "[REDACTED]",
    "sessionId": "7be5f080-9ec6-4293-88a9-2b5fda6418d8",
    "status": "active",
    "issuedAt": {},
    "expiresAt": {},
    "ipAddress": "196.27.107.212",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a7450cec180a23f95f2f87d",
    "updatedBy": "6a7450cec180a23f95f2f87d"
  }
]
```

## tbloauth_tokens

Estimated record count: 0

_No records_

## tblcustomroles

Estimated record count: 2

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 78,
        "2": 36,
        "3": 191,
        "4": 213,
        "5": 70,
        "6": 91,
        "7": 151,
        "8": 24,
        "9": 205,
        "10": 167,
        "11": 231
      }
    },
    "tenantId": "default",
    "organizationId": "default",
    "name": "custom roles",
    "description": null,
    "baseRole": null,
    "permissions": [
      "analytics:view",
      "audit_log:verify",
      "driver:assign",
      "job:manage"
    ],
    "customPermissionKeys": [],
    "scopeType": "organization",
    "isSystem": false,
    "status": "active",
    "version": 2,
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": true,
    "deletedAt": {},
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 80,
        "2": 184,
        "3": 32,
        "4": 158,
        "5": 183,
        "6": 247,
        "7": 64,
        "8": 186,
        "9": 74,
        "10": 11,
        "11": 132
      }
    },
    "tenantId": "default",
    "organizationId": "default",
    "name": "TEST",
    "description": null,
    "baseRole": "driver",
    "permissions": [],
    "customPermissionKeys": [],
    "scopeType": "department",
    "isSystem": false,
    "status": "active",
    "version": 1,
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "needsTenantReview": true,
    "tenantReviewFlaggedAt": {},
    "tenantReviewReason": "created under sentinel tenant; owning organization could not be inferred"
  }
]
```

## tblpurchaserequests

Estimated record count: 0

_No records_

## tblglsubmissions

Estimated record count: 0

_No records_

## tbltelematics_eagletrack_triggers

Estimated record count: 0

_No records_

## tbldashboards

Estimated record count: 0

_No records_

## tblloginattempts

Estimated record count: 863

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 74,
        "2": 79,
        "3": 87,
        "4": 169,
        "5": 225,
        "6": 229,
        "7": 226,
        "8": 63,
        "9": 88,
        "10": 213,
        "11": 21
      }
    },
    "email": "jan@gmail.com",
    "tenantId": "default",
    "userId": "6a0d69356d6ab0b8ca12898f",
    "ipAddress": "::1",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
    "success": true,
    "attemptedAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 78,
        "2": 75,
        "3": 47,
        "4": 93,
        "5": 219,
        "6": 53,
        "7": 68,
        "8": 137,
        "9": 149,
        "10": 173,
        "11": 18
      }
    },
    "email": "jan@gmail.com",
    "tenantId": "default",
    "userId": "6a0d69356d6ab0b8ca12898f",
    "ipAddress": "::1",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
    "success": true,
    "attemptedAt": {}
  }
]
```

## tblssoconnections

Estimated record count: 0

_No records_

## tbltelematics_daily_rollup

Estimated record count: 88

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 146,
        "2": 134,
        "3": 150,
        "4": 156,
        "5": 161,
        "6": 22,
        "7": 177,
        "8": 138,
        "9": 75,
        "10": 142,
        "11": 160
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "day": {},
    "vehicleId": "6a56527d1ce9bf3be5265aff",
    "alertCount": 0,
    "avgSpeedKmh": 0,
    "createdAt": {},
    "firstFixAt": {},
    "fixCount": 1,
    "isDeleted": false,
    "lastFixAt": {},
    "maxSpeedKmh": 0,
    "odometerEnd": 84347.4,
    "odometerStart": 84347.4,
    "orgUnitId": "6a74694e60900c100f2a4ecb",
    "updatedAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 146,
        "2": 134,
        "3": 150,
        "4": 156,
        "5": 161,
        "6": 22,
        "7": 177,
        "8": 138,
        "9": 75,
        "10": 142,
        "11": 161
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "vehicleId": "6a5652c31ce9bf3be5265b07",
    "day": {},
    "alertCount": 0,
    "avgSpeedKmh": 0,
    "createdAt": {},
    "firstFixAt": {},
    "fixCount": 1,
    "isDeleted": false,
    "lastFixAt": {},
    "maxSpeedKmh": 0,
    "orgUnitId": "6a74694e60900c100f2a4ecb",
    "updatedAt": {}
  }
]
```

## tbldrivers

Estimated record count: 8

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 118,
        "3": 14,
        "4": 99,
        "5": 146,
        "6": 221,
        "7": 216,
        "8": 93,
        "9": 174,
        "10": 111,
        "11": 123
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "name": "Fanuel",
    "status": "active",
    "email": "fanual@gmail.com",
    "phone": "+263719153857",
    "driver_code": "001",
    "license_number": "",
    "license_expiry": null,
    "notes": "",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": true,
    "deletedAt": {},
    "createdBy": "6a74695060900c100f2a4ed0",
    "updatedBy": "6a7450cec180a23f95f2f87d"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 118,
        "3": 78,
        "4": 99,
        "5": 146,
        "6": 221,
        "7": 216,
        "8": 93,
        "9": 174,
        "10": 111,
        "11": 125
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "name": "Fanuel",
    "status": "active",
    "email": "fan@gmail.com",
    "phone": "+263719153857",
    "driver_code": "",
    "license_number": "",
    "license_expiry": null,
    "notes": "",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a74695060900c100f2a4ed0",
    "updatedBy": "6a74695060900c100f2a4ed0"
  }
]
```

## tblplugins

Estimated record count: 0

_No records_

## tblmfafactors

Estimated record count: 1

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 77,
        "2": 27,
        "3": 136,
        "4": 7,
        "5": 218,
        "6": 215,
        "7": 183,
        "8": 14,
        "9": 32,
        "10": 90,
        "11": 60
      }
    },
    "tenantId": "default",
    "userId": "6a0d69356d6ab0b8ca12898f",
    "type": "totp",
    "secretEncrypted": "[REDACTED]",
    "status": "pending",
    "label": "jan@gmail.com",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f"
  }
]
```

## tblgeocode_cache

Estimated record count: 0

_No records_

## tbltenant_repair_audit

Estimated record count: 17010

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 115,
        "2": 72,
        "3": 213,
        "4": 32,
        "5": 123,
        "6": 113,
        "7": 13,
        "8": 158,
        "9": 28,
        "10": 28,
        "11": 55
      }
    },
    "at": {},
    "collection": "tbladmin",
    "documentId": "69c241ef2549db3d216e2cf7",
    "action": "PLATFORM_ADMIN_REPAIRED",
    "email": "fredtinotenda3@gmail.com",
    "changes": [
      {
        "field": "tenantId",
        "from": "default",
        "to": null
      },
      {
        "field": "Password",
        "from": "(unchanged)",
        "to": "(bcrypt hash, cost 10)"
      }
    ],
    "actor": "scripts/bootstrap-platform-admin.ts"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 115,
        "2": 73,
        "3": 198,
        "4": 201,
        "5": 250,
        "6": 12,
        "7": 50,
        "8": 195,
        "9": 197,
        "10": 22,
        "11": 217
      }
    },
    "runId": "6a7349a5c9fa0c32c3c516d8",
    "at": {},
    "collection": "tbladmin",
    "documentId": "69c241ef2549db3d216e2cf7",
    "field": "tenantId",
    "before": null,
    "after": "willsgrove-farm-enterprises-9e80ed",
    "ladder": "scope assignment",
    "actor": "scripts/tenant-data-repair.ts"
  }
]
```

## tblslatrackings

Estimated record count: 0

_No records_

## tblfuelstations

Estimated record count: 16

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 79,
        "2": 109,
        "3": 219,
        "4": 207,
        "5": 98,
        "6": 245,
        "7": 14,
        "8": 135,
        "9": 174,
        "10": 29,
        "11": 212
      }
    },
    "name": "Thuli",
    "brand": "thuli",
    "address": "no. 257 Copshaw Road, Harare, Zimbabwe",
    "city": "Harare",
    "country": "Zimbabwe",
    "phone": "0772434353",
    "fuel_types": [
      "Petrol",
      "Diesel",
      "Electric",
      "CNG",
      "LPG",
      "Hybrid",
      "Hydrogen"
    ],
    "is_preferred": false,
    "status": "active",
    "notes": "",
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "tenantAssignedAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 80,
        "2": 206,
        "3": 134,
        "4": 175,
        "5": 37,
        "6": 77,
        "7": 163,
        "8": 147,
        "9": 209,
        "10": 87,
        "11": 85
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "name": "Thuli",
    "isActive": true,
    "brand": "thuli",
    "address": "no. 257 Copshaw Road, Harare, Zimbabwe",
    "city": "Harare",
    "country": "Zimbabwe",
    "latitude": null,
    "longitude": null,
    "phone": "0772434353",
    "notes": "",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "tenantAssignedAt": {}
  }
]
```

## admins

Estimated record count: 0

_No records_

## tblexpenses

Estimated record count: 0

_No records_

## tbltelematics

Estimated record count: 0

_No records_

## tblfuellogs

Estimated record count: 40

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 116,
        "3": 197,
        "4": 33,
        "5": 155,
        "6": 93,
        "7": 49,
        "8": 4,
        "9": 192,
        "10": 30,
        "11": 165
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "license_plate": "AFK5777",
    "date": {},
    "fuel_volume": 220,
    "unit_id": "litre",
    "cost": 429,
    "payment_method": "company_account",
    "orgUnitId": "6a7450cdc180a23f95f2f875",
    "odometer": 0,
    "fuel_type": "Diesel",
    "currency": "USD",
    "is_full_tank": false,
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a74695060900c100f2a4ed0",
    "updatedBy": "6a7450cec180a23f95f2f87d",
    "fuel_station_id": "6a5a156a11ec9a972c7fcbd6"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 117,
        "3": 126,
        "4": 156,
        "5": 77,
        "6": 0,
        "7": 208,
        "8": 137,
        "9": 68,
        "10": 181,
        "11": 209
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "license_plate": "AFK4234",
    "date": {},
    "fuel_volume": 100,
    "unit_id": "litre",
    "cost": 195,
    "payment_method": "company_account",
    "orgUnitId": "6a7450cdc180a23f95f2f875",
    "odometer": 0,
    "fuel_type": "Diesel",
    "currency": "USD",
    "is_full_tank": false,
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a74695060900c100f2a4ed0",
    "updatedBy": "6a7450cec180a23f95f2f87d",
    "fuel_station_id": "6a5a156a11ec9a972c7fcbd6"
  }
]
```

## tblreporttemplates

Estimated record count: 4

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 149,
        "2": 90,
        "3": 66,
        "4": 240,
        "5": 23,
        "6": 255,
        "7": 117,
        "8": 252,
        "9": 152,
        "10": 45,
        "11": 8
      }
    },
    "name": "Fleet Overview",
    "description": "High-level snapshot of the vehicle fleet",
    "category": "fleet_overview",
    "definition": {
      "name": "Fleet Overview",
      "dataSource": "vehicles",
      "fields": [
        "license_plate",
        "make",
        "model",
        "status",
        "odometer"
      ],
      "groupBy": [
        {
          "field": "status"
        }
      ],
      "aggregations": [
        {
          "field": "odometer",
          "fn": "avg",
          "alias": "avg_odometer"
        }
      ]
    },
    "isSystemTemplate": true,
    "tenantId": "__system_owned__",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": null,
    "updatedBy": null
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 149,
        "2": 90,
        "3": 66,
        "4": 240,
        "5": 23,
        "6": 255,
        "7": 117,
        "8": 252,
        "9": 152,
        "10": 45,
        "11": 9
      }
    },
    "name": "Cost Analysis by Category",
    "description": "Total expenses grouped by category",
    "category": "cost_analysis",
    "definition": {
      "name": "Cost Analysis by Category",
      "dataSource": "expenses",
      "fields": [
        "expense_type_id",
        "amount"
      ],
      "groupBy": [
        {
          "field": "expense_type_id"
        }
      ],
      "aggregations": [
        {
          "field": "amount",
          "fn": "sum",
          "alias": "total_amount"
        }
      ]
    },
    "isSystemTemplate": true,
    "tenantId": "__system_owned__",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": null,
    "updatedBy": null
  }
]
```

## tbltelematics_cartrack_config

Estimated record count: 0

_No records_

## tbloauth_clients

Estimated record count: 0

_No records_

## tblnotifications

Estimated record count: 295

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 116,
        "3": 61,
        "4": 145,
        "5": 78,
        "6": 114,
        "7": 22,
        "8": 201,
        "9": 20,
        "10": 194,
        "11": 0
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "userId": "6a7450cec180a23f95f2f87d",
    "type": "system",
    "title": "New Vehicle Added",
    "message": "Vehicle AFK5777 has been added.",
    "data": {
      "vehicleId": "6a99743cac5397695ab86bd0"
    },
    "priority": "medium",
    "actionUrl": "/vehicles/6a99743cac5397695ab86bd0",
    "actionLabel": "View Vehicle",
    "expiresAt": null,
    "read": false,
    "readAt": null,
    "sentAt": {},
    "deliveryMethods": [
      "in_app"
    ],
    "isDeleted": false,
    "createdAt": {},
    "updatedAt": {},
    "deletedAt": null,
    "createdBy": "6a7450cec180a23f95f2f87d",
    "updatedBy": "6a7450cec180a23f95f2f87d"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 116,
        "3": 61,
        "4": 145,
        "5": 78,
        "6": 114,
        "7": 22,
        "8": 201,
        "9": 20,
        "10": 194,
        "11": 1
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "userId": "6a630c6cf6f76c98fb4d7a8d",
    "type": "system",
    "title": "New Vehicle Added",
    "message": "Vehicle AFK5777 has been added.",
    "data": {
      "vehicleId": "6a99743cac5397695ab86bd0"
    },
    "priority": "medium",
    "actionUrl": "/vehicles/6a99743cac5397695ab86bd0",
    "actionLabel": "View Vehicle",
    "expiresAt": null,
    "read": false,
    "readAt": null,
    "sentAt": {},
    "deliveryMethods": [
      "in_app"
    ],
    "isDeleted": false,
    "createdAt": {},
    "updatedAt": {},
    "deletedAt": null,
    "createdBy": "6a630c6cf6f76c98fb4d7a8d",
    "updatedBy": "6a630c6cf6f76c98fb4d7a8d"
  }
]
```

## tblaccountlockouts

Estimated record count: 30

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 79,
        "2": 116,
        "3": 106,
        "4": 46,
        "5": 85,
        "6": 124,
        "7": 205,
        "8": 230,
        "9": 209,
        "10": 153,
        "11": 45
      }
    },
    "email": "jan@gmail.com",
    "tenantId": "default",
    "failedCount": 0,
    "lastFailedAt": {},
    "updatedAt": {},
    "lockedUntil": null
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 99,
        "2": 70,
        "3": 140,
        "4": 93,
        "5": 163,
        "6": 8,
        "7": 139,
        "8": 110,
        "9": 159,
        "10": 62,
        "11": 151
      }
    },
    "email": "fredtinotenda3@gmail.com",
    "tenantId": "default",
    "failedCount": 0,
    "lastFailedAt": {},
    "updatedAt": {},
    "lockedUntil": null
  }
]
```

## tblattentionitems

Estimated record count: 141

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 115,
        "3": 145,
        "4": 234,
        "5": 233,
        "6": 96,
        "7": 126,
        "8": 247,
        "9": 210,
        "10": 88,
        "11": 153
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "itemKey": "fleet_health:Fuel-0",
    "cost": 1000,
    "createdAt": {},
    "description": "Current fuel efficiency (0.0 km/L) is below optimal.",
    "dueDate": null,
    "entityId": null,
    "entityLabel": null,
    "evidence": null,
    "firstSeenAt": {},
    "href": null,
    "isDeleted": false,
    "lastSeenAt": {},
    "orgUnitId": null,
    "priorityScore": 91.6227766016838,
    "severity": "medium",
    "source": "fleet_health",
    "status": "open",
    "title": "Improve fleet fuel efficiency",
    "updatedAt": {},
    "urgency": "planned"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 119,
        "3": 78,
        "4": 234,
        "5": 233,
        "6": 96,
        "7": 126,
        "8": 247,
        "9": 210,
        "10": 88,
        "11": 157
      }
    },
    "itemKey": "predictive_maintenance:198a3955-66af-469c-b042-a05c39fbe190",
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "cost": 2500,
    "createdAt": {},
    "description": "AFK4234: Schedule maintenance within 14 days.",
    "dueDate": {},
    "entityId": "6a997521873fc0a20fac0ba1",
    "entityLabel": "AFK4234",
    "evidence": [
      {
        "source": "tblvehicles",
        "reference": "6a997521873fc0a20fac0ba1"
      }
    ],
    "firstSeenAt": {},
    "href": null,
    "isDeleted": false,
    "lastSeenAt": {},
    "orgUnitId": "6a7450cdc180a23f95f2f875",
    "priorityScore": 105,
    "severity": "medium",
    "source": "predictive_maintenance",
    "status": "open",
    "title": "Engine may fail soon",
    "updatedAt": {},
    "urgency": "monitor"
  }
]
```

## tblstockmovements

Estimated record count: 0

_No records_

## tbltelematics_alerts

Estimated record count: 0

_No records_

## tblreportdefinitions

Estimated record count: 8

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 86,
        "2": 13,
        "3": 250,
        "4": 202,
        "5": 126,
        "6": 81,
        "7": 70,
        "8": 144,
        "9": 85,
        "10": 35,
        "11": 169
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "name": "TEST",
    "description": "",
    "dataSource": "fuel",
    "fields": [
      "license_plate",
      "date",
      "fuel_volume",
      "cost",
      "fuel_type",
      "station_name"
    ],
    "filters": [],
    "groupBy": [],
    "aggregations": [
      {
        "field": "fuel_volume",
        "fn": "max",
        "alias": "Fuel Volume"
      },
      {
        "field": "cost",
        "fn": "max",
        "alias": "Cost"
      }
    ],
    "sort": [],
    "pivot": null,
    "chart": {
      "type": "line",
      "xField": "date",
      "yField": "fuel_volume"
    },
    "schedule": null,
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": true,
    "deletedAt": {},
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "tenantAssignedAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 90,
        "2": 44,
        "3": 16,
        "4": 178,
        "5": 176,
        "6": 189,
        "7": 253,
        "8": 170,
        "9": 86,
        "10": 247,
        "11": 205
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "name": "TESTING",
    "description": "",
    "dataSource": "fuel",
    "fields": [
      "date",
      "license_plate",
      "fuel_volume",
      "cost",
      "fuel_type",
      "station_name"
    ],
    "filters": [
      {
        "field": "license_plate",
        "operator": "eq",
        "value": ""
      }
    ],
    "groupBy": [],
    "aggregations": [
      {
        "field": "fuel_volume",
        "fn": "max",
        "alias": "Fuel Volume"
      },
      {
        "field": "cost",
        "fn": "max",
        "alias": "Cost"
      }
    ],
    "sort": [],
    "pivot": null,
    "chart": {
      "type": "bar",
      "xField": "date",
      "yField": "fuel_volume"
    },
    "schedule": null,
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": true,
    "deletedAt": {},
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "tenantAssignedAt": {}
  }
]
```

## tblspareparts

Estimated record count: 0

_No records_

## tblplugininstallations

Estimated record count: 0

_No records_

## tblpurchaseorders

Estimated record count: 0

_No records_

## tbluser_scope_assignments

Estimated record count: 22

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 117,
        "2": 184,
        "3": 235,
        "4": 119,
        "5": 247,
        "6": 93,
        "7": 179,
        "8": 188,
        "9": 118,
        "10": 51,
        "11": 120
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "organizationId": "willsgrove-farm-enterprises-9e80ed",
    "userId": "6a74695060900c100f2a4ed0",
    "orgUnitId": "6a7450cdc180a23f95f2f875",
    "role": "branch_manager",
    "isCustomRole": false,
    "assignedBy": "scripts/tenancy-rebuild",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 117,
        "2": 184,
        "3": 235,
        "4": 119,
        "5": 247,
        "6": 93,
        "7": 179,
        "8": 188,
        "9": 118,
        "10": 51,
        "11": 121
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "organizationId": "willsgrove-farm-enterprises-9e80ed",
    "userId": "6a7450cfc180a23f95f2f87f",
    "orgUnitId": "6a7450cdc180a23f95f2f875",
    "role": "dispatcher",
    "isCustomRole": false,
    "assignedBy": "scripts/tenancy-rebuild",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null
  }
]
```

## tblinvoices

Estimated record count: 0

_No records_

## tblapikeys

Estimated record count: 0

_No records_

## tblauditlog

Estimated record count: 21152

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 74,
        "2": 79,
        "3": 88,
        "4": 169,
        "5": 225,
        "6": 229,
        "7": 226,
        "8": 63,
        "9": 88,
        "10": 213,
        "11": 24
      }
    },
    "sequence": 1,
    "prevHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "action": "REFRESH_TOKEN_ISSUED",
    "category": "domain",
    "severity": "info",
    "userId": "6a0d69356d6ab0b8ca12898f",
    "tenantId": "default",
    "entityType": "session",
    "entityId": "6a4a4f58a9e1e5e23f58d516",
    "ipAddress": null,
    "userAgent": null,
    "metadata": {
      "familyId": "ac1fe431-a2ff-40c2-878c-f41672973c5a",
      "ipAddress": "::1"
    },
    "changes": null,
    "eventId": null,
    "recordedAt": {},
    "hash": "66a5fb7b1b1cc6b08644435cba718cd7f06772b15b22731d26f8a74794502c54",
    "createdAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 77,
        "2": 254,
        "3": 184,
        "4": 147,
        "5": 200,
        "6": 11,
        "7": 135,
        "8": 168,
        "9": 83,
        "10": 150,
        "11": 169
      }
    },
    "sequence": 2,
    "prevHash": "66a5fb7b1b1cc6b08644435cba718cd7f06772b15b22731d26f8a74794502c54",
    "action": "EVENT_ObservabilityAlertTriggered",
    "category": "domain",
    "severity": "info",
    "userId": "system",
    "tenantId": "system",
    "entityType": "alert",
    "entityId": null,
    "ipAddress": null,
    "userAgent": null,
    "metadata": {
      "eventId": "b19c8918-cc8f-4d1c-8238-8ab0aec49cce",
      "occurredOn": {},
      "payload": {
        "entityType": "alert",
        "metric": "http_latency",
        "value": 5838,
        "threshold": 2000,
        "severity": "warning",
        "message": "Slow request: GET /api/ai/dashboard took 5838ms",
        "labels": {
          "route": "/api/ai/dashboard",
          "method": "GET"
        }
      }
    },
    "changes": null,
    "eventId": null,
    "recordedAt": {},
    "hash": "1f9d1fc318f9281e90159aa79ce804729fef834ee0dfc28d6d1bf6a1552b640f",
    "createdAt": {}
  }
]
```

## tblfuelcards

Estimated record count: 5

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 79,
        "2": 109,
        "3": 105,
        "4": 207,
        "5": 98,
        "6": 245,
        "7": 14,
        "8": 135,
        "9": 174,
        "10": 29,
        "11": 210
      }
    },
    "card_number": "Card Tes",
    "provider": "card",
    "assigned_to_vehicle": "Wills",
    "assigned_to_driver": "Noah",
    "status": "active",
    "expiry_date": "2026-07-31",
    "monthly_limit": 600,
    "currency": "USD",
    "notes": "",
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "tenantAssignedAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 79,
        "2": 109,
        "3": 141,
        "4": 207,
        "5": 98,
        "6": 245,
        "7": 14,
        "8": 135,
        "9": 174,
        "10": 29,
        "11": 211
      }
    },
    "card_number": "Card Tes",
    "provider": "card",
    "assigned_to_vehicle": "not exist",
    "assigned_to_driver": "Noah",
    "status": "active",
    "expiry_date": "2026-07-31",
    "monthly_limit": 600,
    "currency": "USD",
    "notes": "",
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "tenantAssignedAt": {}
  }
]
```

## tblusersessions

Estimated record count: 754

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 74,
        "2": 79,
        "3": 88,
        "4": 169,
        "5": 225,
        "6": 229,
        "7": 226,
        "8": 63,
        "9": 88,
        "10": 213,
        "11": 22
      }
    },
    "tenantId": "default",
    "userId": "6a0d69356d6ab0b8ca12898f",
    "sessionId": "731007f0-3ae0-467c-b709-af68fcdf234d",
    "status": "expired",
    "ipAddress": "::1",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
    "deviceLabel": null,
    "issuedAt": {},
    "lastActiveAt": {},
    "expiresAt": {},
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 78,
        "2": 75,
        "3": 47,
        "4": 93,
        "5": 219,
        "6": 53,
        "7": 68,
        "8": 137,
        "9": 149,
        "10": 173,
        "11": 19
      }
    },
    "tenantId": "default",
    "userId": "6a0d69356d6ab0b8ca12898f",
    "sessionId": "2db0d916-572d-4f00-93de-25293f3ef222",
    "status": "expired",
    "ipAddress": "::1",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
    "deviceLabel": null,
    "issuedAt": {},
    "lastActiveAt": {},
    "expiresAt": {},
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f"
  }
]
```

## tblattention_dispatches

Estimated record count: 0

_No records_

## tblrules

Estimated record count: 0

_No records_

## tblreportexecutions

Estimated record count: 0

_No records_

## tblscheduledjobs

Estimated record count: 15

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 145,
        "2": 72,
        "3": 41,
        "4": 21,
        "5": 244,
        "6": 7,
        "7": 192,
        "8": 250,
        "9": 92,
        "10": 185,
        "11": 52
      }
    },
    "name": "reminders-overdue-check",
    "description": "Mark overdue reminders and notify assignees",
    "jobType": "check-overdue",
    "cron": "0 * * * *",
    "payload": {},
    "status": "active",
    "tenantId": "__system_owned__",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "system",
    "updatedBy": "system"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 145,
        "2": 72,
        "3": 45,
        "4": 21,
        "5": 244,
        "6": 7,
        "7": 192,
        "8": 250,
        "9": 92,
        "10": 185,
        "11": 54
      }
    },
    "name": "billing-expire-invoices",
    "description": "Expire stale pending invoices",
    "jobType": "expire-invoices",
    "cron": "0 * * * *",
    "payload": {},
    "status": "active",
    "tenantId": "__system_owned__",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "system",
    "updatedBy": "system"
  }
]
```

## tbltrips

Estimated record count: 0

_No records_

## tblorganizations

Estimated record count: 1

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 78,
        "2": 16,
        "3": 180,
        "4": 166,
        "5": 68,
        "6": 181,
        "7": 174,
        "8": 46,
        "9": 97,
        "10": 209,
        "11": 163
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "name": "Willsgrove Farm Enterprises_Harare",
    "slug": "willsgrove-farm-enterprises-9e80ed",
    "branding": {
      "companyName": "Willsgrove Farm Enterprises_Harare"
    },
    "settings": {
      "timezone": "Africa/Harare",
      "currency": "USD",
      "dateFormat": "DD/MM/YYYY",
      "language": "en",
      "distanceUnit": "km",
      "volumeUnit": "L"
    },
    "subscription": {
      "tier": "free",
      "planId": "free",
      "status": "active",
      "seats": 5,
      "usedSeats": 2,
      "startDate": {},
      "features": [
        "basic_analytics",
        "basic_reports",
        "email_notifications"
      ]
    },
    "features": {
      "maxVehicles": 500,
      "maxUsers": 5,
      "maxStorage": 5,
      "customBranding": true,
      "advancedAnalytics": true,
      "telematics": true,
      "apiAccess": true,
      "auditLogs": true,
      "prioritySupport": true
    },
    "status": "active",
    "ownerId": "6a0d69356d6ab0b8ca12898f",
    "members": [
      {
        "userId": "6a7450cec180a23f95f2f87d",
        "email": "owner@willsgrove.test",
        "role": "organization_owner",
        "status": "active",
        "joinedAt": {}
      },
      {
        "userId": "6a74694f60900c100f2a4ecf",
        "email": "admin@willsgrove.test",
        "role": "organization_admin",
        "status": "active",
        "joinedAt": {}
      },
      {
        "userId": "69c241ef2549db3d216e2cf7",
        "email": "fredtinotenda3@gmail.com",
        "role": "super_admin",
        "status": "active",
        "joinedAt": {}
      },
      {
        "userId": "6a74695060900c100f2a4ed0",
        "email": "harare.manager@willsgrove.test",
        "role": "branch_manager",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f875"
      },
      {
        "userId": "6a7450cfc180a23f95f2f87f",
        "email": "harare.dispatcher@willsgrove.test",
        "role": "dispatcher",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f875"
      },
      {
        "userId": "6a7450cfc180a23f95f2f881",
        "email": "harare.accountant@willsgrove.test",
        "role": "accountant",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f875"
      },
      {
        "userId": "6a7450d1c180a23f95f2f887",
        "email": "harare.auditor@willsgrove.test",
        "role": "auditor",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f875"
      },
      {
        "userId": "6a630c6cf6f76c98fb4d7a8d",
        "email": "stanley@gmail.com",
        "role": "fleet_manager",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f875"
      },
      {
        "userId": "6a65bf25c9b90f7a167f7e19",
        "email": "aryes@gmail.com",
        "role": "viewer",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f875"
      },
      {
        "userId": "6a74695160900c100f2a4ed2",
        "email": "logistics.manager@willsgrove.test",
        "role": "department_manager",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694d60900c100f2a4ec7"
      },
      {
        "userId": "6a74695260900c100f2a4ed4",
        "email": "fleet.manager@willsgrove.test",
        "role": "fleet_manager",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694e60900c100f2a4ecb"
      },
      {
        "userId": "6a74695260900c100f2a4ed5",
        "email": "driver@willsgrove.test",
        "role": "driver",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694e60900c100f2a4ecb"
      },
      {
        "userId": "6a7450d0c180a23f95f2f885",
        "email": "harare.driver@willsgrove.test",
        "role": "driver",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694e60900c100f2a4ecc"
      },
      {
        "userId": "6a7450cec180a23f95f2f87e",
        "email": "fleetmanager@willsgrove.test",
        "role": "fleet_manager",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694e60900c100f2a4ecc"
      },
      {
        "userId": "6a74695160900c100f2a4ed3",
        "email": "workshop.manager@willsgrove.test",
        "role": "workshop_manager",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694e60900c100f2a4ec9"
      },
      {
        "userId": "6a74695360900c100f2a4ed6",
        "email": "mechanic@willsgrove.test",
        "role": "mechanic",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694e60900c100f2a4ec9"
      },
      {
        "userId": "6a7450d0c180a23f95f2f883",
        "email": "harare.mechanic@willsgrove.test",
        "role": "mechanic",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694e60900c100f2a4ec9"
      },
      {
        "userId": "6a74695060900c100f2a4ed1",
        "email": "bulawayo.manager@willsgrove.test",
        "role": "branch_manager",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f87a"
      },
      {
        "userId": "6a7450d1c180a23f95f2f889",
        "email": "bulawayo.dispatcher@willsgrove.test",
        "role": "dispatcher",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f87a"
      },
      {
        "userId": "6a7450d2c180a23f95f2f88d",
        "email": "bulawayo.viewer@willsgrove.test",
        "role": "viewer",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f87a"
      },
      {
        "userId": "6a7450d2c180a23f95f2f88b",
        "email": "bulawayo.mechanic@willsgrove.test",
        "role": "mechanic",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a74694e60900c100f2a4eca"
      },
      {
        "userId": "6a74695360900c100f2a4ed7",
        "email": "accountant@willsgrove.test",
        "role": "accountant",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f875"
      },
      {
        "userId": "6a74695460900c100f2a4ed8",
        "email": "auditor@willsgrove.test",
        "role": "auditor",
        "status": "active",
        "joinedAt": {},
        "orgUnitId": "6a7450cdc180a23f95f2f875"
      },
      {
        "userId": "69c3ca3d794b05654e3b1785",
        "email": "accounts@willsgrove.co.zw",
        "role": "viewer",
        "status": "active",
        "joinedAt": {}
      },
      {
        "userId": "6a630b6197a74110d37da891",
        "email": "pastor@gmail.com",
        "role": "auditor",
        "status": "active",
        "joinedAt": {}
      },
      {
        "userId": "6a646b511a06b5f97796b51e",
        "email": "fred@gmail.com",
        "role": "fleet_manager",
        "status": "active",
        "joinedAt": {}
      },
      {
        "userId": "6a74695460900c100f2a4ed9",
        "email": "unassigned@willsgrove.test",
        "role": "viewer",
        "status": "active",
        "joinedAt": {}
      }
    ],
    "invites": [
      {
        "organizationId": "6a4e10b4a644b5ae2e61d1a3",
        "email": "fredtinotenda3@gmail.com",
        "role": "fleet_manager",
        "invitedBy": "6a0d69356d6ab0b8ca12898f",
        "token": "[REDACTED]",
        "expiresAt": {},
        "status": "cancelled"
      },
      {
        "organizationId": "6a4e10b4a644b5ae2e61d1a3",
        "email": "fredtinotenda@gmail.com",
        "role": "viewer",
        "invitedBy": "6a0d69356d6ab0b8ca12898f",
        "token": "[REDACTED]",
        "expiresAt": {},
        "status": "cancelled"
      }
    ],
    "isDeleted": false,
    "createdAt": {},
    "updatedAt": {},
    "deletedAt": null,
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "contact": {
      "contactEmail": "teetoronga@yahoo.co.uk",
      "contactPhone": "+263772434353",
      "addressLine1": "no. 257 Copshaw Road, Harare, Zimbabwe",
      "addressLine2": "Waterfalls",
      "city": "Harare",
      "state": "",
      "postalCode": "",
      "country": "Zimbabwe"
    },
    "businessHours": {
      "monday": {
        "enabled": true,
        "openTime": "06:00",
        "closeTime": "17:00"
      },
      "tuesday": {
        "enabled": true,
        "openTime": "08:00",
        "closeTime": "17:00"
      },
      "wednesday": {
        "enabled": true,
        "openTime": "08:00",
        "closeTime": "17:00"
      },
      "thursday": {
        "enabled": true,
        "openTime": "08:00",
        "closeTime": "17:00"
      },
      "friday": {
        "enabled": true,
        "openTime": "08:00",
        "closeTime": "17:00"
      },
      "saturday": {
        "enabled": false,
        "openTime": "08:00",
        "closeTime": "13:00"
      },
      "sunday": {
        "enabled": false,
        "openTime": "08:00",
        "closeTime": "13:00"
      }
    },
    "taxSettings": {
      "taxId": "1011",
      "taxRate": 0,
      "taxInclusivePricing": false
    },
    "reportingPreferences": {
      "defaultExportFormat": "pdf",
      "autoWeeklyDigest": true
    },
    "aiSettings": {
      "enabled": true,
      "predictiveMaintenance": true,
      "fuelFraudDetection": true,
      "driverRiskScoring": true,
      "expenseAnomalyDetection": true,
      "confidenceThreshold": 0.7
    }
  }
]
```

## tblbookings

Estimated record count: 0

_No records_

## tblwebhooksubscriptions

Estimated record count: 0

_No records_

## tblmeterlogs

Estimated record count: 0

_No records_

## tbltelematics_devices

Estimated record count: 0

_No records_

## tbldepreciationprofiles

Estimated record count: 0

_No records_

## tblresourcepermissions

Estimated record count: 0

_No records_

## tblslapolicies

Estimated record count: 0

_No records_

## tblworkflow_instances

Estimated record count: 0

_No records_

## tblunits

Estimated record count: 3

```json
[
  {
    "_id": {
      "buffer": {
        "0": 102,
        "1": 66,
        "2": 132,
        "3": 165,
        "4": 252,
        "5": 19,
        "6": 174,
        "7": 26,
        "8": 109,
        "9": 143,
        "10": 65,
        "11": 230
      }
    },
    "unit_id": "litre",
    "name": "Litre",
    "symbol": "L",
    "type": "volume"
  },
  {
    "_id": {
      "buffer": {
        "0": 102,
        "1": 66,
        "2": 132,
        "3": 165,
        "4": 252,
        "5": 19,
        "6": 174,
        "7": 26,
        "8": 109,
        "9": 143,
        "10": 65,
        "11": 229
      }
    },
    "unit_id": "km",
    "name": "Kilometer",
    "symbol": "km",
    "type": "distance"
  }
]
```

## tblkpidefinitions

Estimated record count: 0

_No records_

## tblexpense_types

Estimated record count: 36

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 86,
        "2": 60,
        "3": 44,
        "4": 96,
        "5": 212,
        "6": 132,
        "7": 251,
        "8": 163,
        "9": 131,
        "10": 125,
        "11": 0
      }
    },
    "name": "Airline Repair",
    "category": "repair",
    "description": "Airline leak or bulge repair",
    "isDeleted": false,
    "createdAt": {},
    "sortOrder": 2
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 86,
        "2": 60,
        "3": 44,
        "4": 96,
        "5": 212,
        "6": 132,
        "7": 251,
        "8": 163,
        "9": 131,
        "10": 125,
        "11": 3
      }
    },
    "name": "Suspension Repair",
    "category": "maintenance",
    "description": "Springs, shocks, U-bolts",
    "isDeleted": false,
    "createdAt": {},
    "sortOrder": 5
  }
]
```

## tblorgunits

Estimated record count: 26

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 98,
        "2": 4,
        "3": 49,
        "4": 180,
        "5": 40,
        "6": 131,
        "7": 33,
        "8": 79,
        "9": 15,
        "10": 63,
        "11": 219
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "organizationId": "default",
    "type": "branch",
    "name": "Harare Depot",
    "code": "HAR-001",
    "parentId": null,
    "path": [],
    "depth": 0,
    "managerId": null,
    "metadata": null,
    "status": "active",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": true,
    "deletedAt": {},
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "tenantAssignedAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 98,
        "2": 33,
        "3": 154,
        "4": 243,
        "5": 149,
        "6": 130,
        "7": 157,
        "8": 184,
        "9": 157,
        "10": 70,
        "11": 206
      }
    },
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "organizationId": "default",
    "type": "branch",
    "name": "GLOW",
    "code": null,
    "parentId": null,
    "path": [],
    "depth": 0,
    "managerId": null,
    "metadata": null,
    "status": "active",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": true,
    "deletedAt": {},
    "createdBy": "6a0d69356d6ab0b8ca12898f",
    "updatedBy": "6a0d69356d6ab0b8ca12898f",
    "tenantAssignedAt": {}
  }
]
```

## tbldrivershifts

Estimated record count: 0

_No records_

## tbltelematics_geofences

Estimated record count: 0

_No records_

## tbltelematics_geofence_states

Estimated record count: 0

_No records_

## tbldispatchjobs

Estimated record count: 0

_No records_

## tblcompliancerecords

Estimated record count: 0

_No records_

## tblvehicledigitaltwins

Estimated record count: 177

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 78,
        "2": 108,
        "3": 163,
        "4": 7,
        "5": 18,
        "6": 117,
        "7": 22,
        "8": 176,
        "9": 92,
        "10": 227,
        "11": 81
      }
    },
    "tenantId": "default",
    "vehicleId": "6a4e6ca245f1dbc72bd770b2",
    "alerts": [],
    "createdAt": {},
    "currentState": {
      "lastUpdated": {},
      "status": "active"
    },
    "documents": [],
    "isDeleted": false,
    "lastEventName": "VehicleCreated",
    "license_plate": "WILLS",
    "tires": [],
    "updatedAt": {},
    "version": 1
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 78,
        "2": 114,
        "3": 169,
        "4": 7,
        "5": 18,
        "6": 117,
        "7": 22,
        "8": 176,
        "9": 92,
        "10": 227,
        "11": 84
      }
    },
    "vehicleId": {
      "buffer": {
        "0": 106,
        "1": 58,
        "2": 144,
        "3": 218,
        "4": 7,
        "5": 139,
        "6": 78,
        "7": 184,
        "8": 42,
        "9": 99,
        "10": 105,
        "11": 90
      }
    },
    "tenantId": "default",
    "alerts": [],
    "createdAt": {},
    "currentState": {
      "lastUpdated": {},
      "status": "maintenance"
    },
    "documents": [],
    "isDeleted": false,
    "lastEventName": "FuelLogged",
    "license_plate": "AKF5777",
    "tires": [],
    "updatedAt": {},
    "version": 4,
    "fuel": {
      "lastFuelCost": 70,
      "lastFuelDate": {},
      "lastFuelVolume": 80
    }
  }
]
```

## tbldeadletterqueue

Estimated record count: 5

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 149,
        "2": 127,
        "3": 223,
        "4": 1,
        "5": 12,
        "6": 7,
        "7": 103,
        "8": 253,
        "9": 139,
        "10": 32,
        "11": 126
      }
    },
    "originalQueue": "backup-jobs",
    "jobType": "run-backup",
    "jobId": "repeat:9c5b88a98f3f31a78e8678919ffe706f:1788048000000",
    "payload": {},
    "failedReason": "Resolved credential object is not valid",
    "attemptsMade": 3,
    "stacktrace": [
      "Error: Resolved credential object is not valid\n    at SignatureV4SignWithCredentials.validateResolvedCredentials (/app/node_modules/@smithy/signature-v4/dist-cjs/index.js:277:19)\n    at SignatureV4SignWithCredentials.signRequest (/app/node_modules/@smithy/signature-v4/dist-cjs/index.js:495:14)\n    at async AwsSdkSigV4Signer.sign (/app/node_modules/@aws-sdk/core/dist-cjs/submodules/httpAuthSchemes/index.js:61:31)\n    at async /app/node_modules/@aws-sdk/middleware-sdk-s3/dist-cjs/submodules/s3/index.js:363:19\n    at async /app/node_modules/@smithy/core/dist-cjs/submodules/retry/index.js:170:50\n    at async /app/node_modules/@aws-sdk/checksums/dist-cjs/submodules/flexible-checksums/index.js:234:24\n    at async /app/node_modules/@aws-sdk/middleware-sdk-s3/dist-cjs/submodules/s3/index.js:62:28\n    at async /app/node_modules/@aws-sdk/middleware-sdk-s3/dist-cjs/submodules/s3/index.js:89:20\n    at async /app/node_modules/@aws-sdk/core/dist-cjs/submodules/client/index.js:127:26\n    at async StorageService.uploadStream (/app/infrastructure/storage/storage.service.ts:90:5)"
    ],
    "resolved": false,
    "tenantId": "__system_owned__",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "system",
    "updatedBy": "system"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 149,
        "2": 130,
        "3": 32,
        "4": 243,
        "5": 4,
        "6": 55,
        "7": 160,
        "8": 187,
        "9": 155,
        "10": 179,
        "11": 101
      }
    },
    "originalQueue": "backup-jobs",
    "jobType": "run-backup",
    "jobId": "repeat:9c5b88a98f3f31a78e8678919ffe706f:1787961600000",
    "payload": {},
    "failedReason": "Resolved credential object is not valid",
    "attemptsMade": 3,
    "stacktrace": [
      "Error: Resolved credential object is not valid\n    at SignatureV4SignWithCredentials.validateResolvedCredentials (/app/node_modules/@smithy/signature-v4/dist-cjs/index.js:277:19)\n    at SignatureV4SignWithCredentials.signRequest (/app/node_modules/@smithy/signature-v4/dist-cjs/index.js:495:14)\n    at async AwsSdkSigV4Signer.sign (/app/node_modules/@aws-sdk/core/dist-cjs/submodules/httpAuthSchemes/index.js:61:31)\n    at async /app/node_modules/@aws-sdk/middleware-sdk-s3/dist-cjs/submodules/s3/index.js:363:19\n    at async /app/node_modules/@smithy/core/dist-cjs/submodules/retry/index.js:170:50\n    at async /app/node_modules/@aws-sdk/checksums/dist-cjs/submodules/flexible-checksums/index.js:234:24\n    at async /app/node_modules/@aws-sdk/middleware-sdk-s3/dist-cjs/submodules/s3/index.js:62:28\n    at async /app/node_modules/@aws-sdk/middleware-sdk-s3/dist-cjs/submodules/s3/index.js:89:20\n    at async /app/node_modules/@aws-sdk/core/dist-cjs/submodules/client/index.js:127:26\n    at async StorageService.uploadStream (/app/infrastructure/storage/storage.service.ts:90:5)"
    ],
    "resolved": false,
    "tenantId": "__system_owned__",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "system",
    "updatedBy": "system"
  }
]
```

## tblanomalies

Estimated record count: 0

_No records_

## tblwebhookdeliveries

Estimated record count: 0

_No records_

## tbltelematics_eagletrack_config

Estimated record count: 0

_No records_

## tblworkorders

Estimated record count: 0

_No records_

## tblmfabackupcodes

Estimated record count: 0

_No records_

## tblvehicles

Estimated record count: 19

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 116,
        "3": 60,
        "4": 172,
        "5": 83,
        "6": 151,
        "7": 105,
        "8": 90,
        "9": 184,
        "10": 107,
        "11": 208
      }
    },
    "license_plate": "AFK5777",
    "make": "      DAF                  ",
    "model": "AFK5777",
    "year": 2026,
    "vehicle_type": "Truck",
    "purchase_date": "2026-09-03",
    "fuel_type": "Diesel",
    "color": "#3b82f6",
    "vin": "",
    "status": "active",
    "registration_expiry": "",
    "insurance_provider": "",
    "service_interval": 10000,
    "odometer": 0,
    "orgUnitId": "6a7450cdc180a23f95f2f875",
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a74695060900c100f2a4ed0",
    "updatedBy": "6a74695060900c100f2a4ed0"
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 153,
        "2": 117,
        "3": 33,
        "4": 135,
        "5": 63,
        "6": 192,
        "7": 162,
        "8": 15,
        "9": 172,
        "10": 11,
        "11": 161
      }
    },
    "license_plate": "AFK4234",
    "make": "DAF",
    "model": "DAF",
    "year": 2026,
    "vehicle_type": "Truck",
    "purchase_date": "2026-09-03",
    "fuel_type": "Diesel",
    "color": "#3b82f6",
    "vin": "",
    "status": "active",
    "registration_expiry": "",
    "insurance_provider": "",
    "service_interval": 10000,
    "odometer": 0,
    "orgUnitId": "6a7450cdc180a23f95f2f875",
    "tenantId": "willsgrove-farm-enterprises-9e80ed",
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdBy": "6a74695060900c100f2a4ed0",
    "updatedBy": "6a74695060900c100f2a4ed0"
  }
]
```

## tbloutbox_events

Estimated record count: 1810

```json
[
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 141,
        "2": 109,
        "3": 55,
        "4": 161,
        "5": 149,
        "6": 174,
        "7": 139,
        "8": 52,
        "9": 112,
        "10": 194,
        "11": 177
      }
    },
    "tenantId": "default",
    "eventId": "30ff6819-247c-4fb0-9e85-980ee3ef02ac",
    "eventName": "SecurityLoginSuccess",
    "payload": {
      "entityType": "auth",
      "entityId": "6a7450cec180a23f95f2f87d",
      "email": "owner@willsgrove.test",
      "ipAddress": "196.27.107.212",
      "tenantId": "default"
    },
    "metadata": {
      "tenantId": "default",
      "userId": "6a7450cec180a23f95f2f87d",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
    },
    "status": "processed",
    "processed": true,
    "attempts": 0,
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "processedAt": {}
  },
  {
    "_id": {
      "buffer": {
        "0": 106,
        "1": 141,
        "2": 109,
        "3": 66,
        "4": 40,
        "5": 213,
        "6": 101,
        "7": 12,
        "8": 118,
        "9": 52,
        "10": 112,
        "11": 107
      }
    },
    "tenantId": "system",
    "eventId": "94a74493-27e1-4dd1-a887-9183e3e6168d",
    "eventName": "ObservabilityAlertTriggered",
    "payload": {
      "entityType": "alert",
      "metric": "http_latency",
      "value": 5615,
      "threshold": 2000,
      "severity": "warning",
      "message": "Slow request: GET /api/organizations took 5615ms",
      "labels": {
        "route": "/api/organizations",
        "method": "GET"
      }
    },
    "metadata": {
      "tenantId": "system"
    },
    "status": "processed",
    "processed": true,
    "attempts": 0,
    "createdAt": {},
    "updatedAt": {},
    "isDeleted": false,
    "processedAt": {}
  }
]
```

## tblallocationledger

Estimated record count: 0

_No records_

## tblvendors

Estimated record count: 0

_No records_

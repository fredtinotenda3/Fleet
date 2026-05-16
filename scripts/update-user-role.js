// C:\Users\user\Desktop\Fleet\scripts\update-user-role.js

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ MONGODB_URI not defined in .env file');
  process.exit(1);
}

async function updateUserRole() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('VehicleExpense');
    const result = await db.collection('tbladmin').updateOne(
      { Email: 'fredtinotenda3@gmail.com' },
      { 
        $set: { 
          Role: 'super_admin',
          roles: ['super_admin', 'organization_owner'],
          permissions: ['*'],
          tenantId: 'default'
        }
      }
    );
    
    console.log('✅ Updated user:', result.modifiedCount > 0 ? 'YES' : 'NO');
    
    const user = await db.collection('tbladmin').findOne({ Email: 'fredtinotenda3@gmail.com' });
    console.log('📋 User roles:', user?.roles);
    console.log('📋 User Role:', user?.Role);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected');
  }
}

updateUserRole();
'use client';

import { useEffect, useState } from 'react';
import { PaginatedResponse } from '@/shared/types/common.types';
import { Vehicle, VehicleStats } from '@/shared/types/vehicle.types';

export default function TestVehiclesPage() {
  const [vehicles, setVehicles] = useState<PaginatedResponse<Vehicle> | null>(null);
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Fetch vehicles
        const vehiclesRes = await fetch('/api/vehicles?page=1&limit=10');
        const vehiclesData = await vehiclesRes.json();
        console.log('Vehicles API response:', vehiclesData);
        setVehicles(vehiclesData);
        
        // Fetch stats
        const statsRes = await fetch('/api/vehicles?action=stats');
        const statsData = await statsRes.json();
        console.log('Stats API response:', statsData);
        setStats(statsData);
        
      } catch (err) {
        console.error('Error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Vehicles Page</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Stats:</h2>
        <pre className="bg-gray-100 p-4 rounded overflow-auto">
          {JSON.stringify(stats, null, 2)}
        </pre>
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-2">Vehicles:</h2>
        <pre className="bg-gray-100 p-4 rounded overflow-auto">
          {JSON.stringify(vehicles, null, 2)}
        </pre>
      </div>
    </div>
  );
}
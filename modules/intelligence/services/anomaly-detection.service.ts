// modules/intelligence/services/anomaly-detection.service.ts

import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';

export interface Anomaly {
  type: 'fuel' | 'expense' | 'maintenance';
  severity: 'low' | 'medium' | 'high';
  message: string;
  data: any;
  recommendation: string;
}

export class AnomalyDetectionService {
  async detectFuelAnomalies(tenantId: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    
    const fuelLogs = await fuelRepository.findMany({}, tenantId);
    const logsByVehicle = new Map<string, any[]>();
    
    for (const log of fuelLogs) {
      if (!logsByVehicle.has(log.license_plate)) {
        logsByVehicle.set(log.license_plate, []);
      }
      logsByVehicle.get(log.license_plate)!.push(log);
    }
    
    for (const [licensePlate, logs] of logsByVehicle) {
      // Sort by date
      logs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Calculate average consumption
      let totalFuel = 0;
      let totalDistance = 0;
      
      for (let i = 1; i < logs.length; i++) {
        const current = logs[i];
        const previous = logs[i - 1];
        
        if (current.odometer && previous.odometer) {
          const distance = current.odometer - previous.odometer;
          if (distance > 0) {
            totalDistance += distance;
            totalFuel += current.fuel_volume;
          }
        }
      }
      
      const avgEfficiency = totalFuel > 0 ? totalDistance / totalFuel : 0;
      
      // Detect anomalies in recent logs
      const recentLogs = logs.slice(-5);
      for (const log of recentLogs) {
        if (log.odometer) {
          const prevLog = logs[logs.indexOf(log) - 1];
          if (prevLog?.odometer) {
            const distance = log.odometer - prevLog.odometer;
            const efficiency = distance / log.fuel_volume;
            
            // Flag if efficiency is 30% below average
            if (avgEfficiency > 0 && efficiency < avgEfficiency * 0.7) {
              anomalies.push({
                type: 'fuel',
                severity: 'medium',
                message: `Unusual fuel consumption detected for vehicle ${licensePlate}`,
                data: { licensePlate, efficiency, avgEfficiency, log },
                recommendation: 'Check for fuel leaks, tire pressure, or driving behavior',
              });
            }
          }
        }
      }
    }
    
    return anomalies;
  }

  async detectExpenseAnomalies(tenantId: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    
    const expenses = await expenseRepository.findMany({}, tenantId);
    const expensesByVehicle = new Map<string, any[]>();
    
    for (const expense of expenses) {
      if (!expensesByVehicle.has(expense.license_plate)) {
        expensesByVehicle.set(expense.license_plate, []);
      }
      expensesByVehicle.get(expense.license_plate)!.push(expense);
    }
    
    for (const [licensePlate, vehicleExpenses] of expensesByVehicle) {
      // Calculate average monthly expense
      const monthlyTotals = new Map<string, number>();
      for (const expense of vehicleExpenses) {
        const month = new Date(expense.date).toISOString().slice(0, 7);
        monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + expense.amount);
      }
      
      const monthlyValues = Array.from(monthlyTotals.values());
      const avgMonthly = monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length;
      
      // Check last month vs average
      const lastMonth = new Date().toISOString().slice(0, 7);
      const lastMonthTotal = monthlyTotals.get(lastMonth) || 0;
      
      if (avgMonthly > 0 && lastMonthTotal > avgMonthly * 1.5) {
        anomalies.push({
          type: 'expense',
          severity: 'medium',
          message: `Unusual expense increase for vehicle ${licensePlate}`,
          data: { licensePlate, lastMonthTotal, avgMonthly },
          recommendation: 'Review recent expenses for unusual patterns',
        });
      }
    }
    
    return anomalies;
  }

  async runFullDetection(tenantId: string): Promise<Anomaly[]> {
    const [fuelAnomalies, expenseAnomalies] = await Promise.all([
      this.detectFuelAnomalies(tenantId),
      this.detectExpenseAnomalies(tenantId),
    ]);
    
    return [...fuelAnomalies, ...expenseAnomalies];
  }
}

export const anomalyDetectionService = new AnomalyDetectionService();
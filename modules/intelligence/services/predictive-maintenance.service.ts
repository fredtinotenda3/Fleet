// modules/intelligence/services/predictive-maintenance.service.ts

import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { maintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';

export interface MaintenancePrediction {
  vehicleId: string;
  component: string;
  predictedFailureDate: Date;
  confidence: number;
  recommendedAction: string;
  estimatedCost: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export class PredictiveMaintenanceService {
  async predictMaintenanceNeeds(tenantId: string): Promise<MaintenancePrediction[]> {
    const vehicles = await vehicleRepository.findMany({}, tenantId);
    const predictions: MaintenancePrediction[] = [];

    for (const vehicle of vehicles) {
      const telematicsData = await telematicsRepository.getLatestTelematicsData(vehicle._id!, tenantId);
      const maintenanceHistory = await maintenanceRepository.findMany({ license_plate: vehicle.license_plate }, tenantId);
      
      // Engine health prediction based on telematics
      if (telematicsData) {
        const enginePrediction = this.predictEngineHealth(vehicle, telematicsData, maintenanceHistory);
        if (enginePrediction) predictions.push(enginePrediction);
      }
      
      // Component wear prediction based on distance
      const tirePrediction = this.predictTireWear(vehicle, maintenanceHistory);
      if (tirePrediction) predictions.push(tirePrediction);
      
      // Brake wear prediction
      const brakePrediction = this.predictBrakeWear(vehicle, maintenanceHistory, telematicsData);
      if (brakePrediction) predictions.push(brakePrediction);
    }

    return predictions.sort((a, b) => b.confidence - a.confidence);
  }

  private predictEngineHealth(vehicle: any, telematicsData: any, history: any[]): MaintenancePrediction | null {
    const engineMetrics = {
      avgRPM: 0,
      maxTemp: 0,
      faultCodes: telematicsData.engine?.dtcCodes?.length || 0,
    };
    
    if (telematicsData.engine) {
      engineMetrics.avgRPM = telematicsData.engine.rpm || 0;
      engineMetrics.maxTemp = telematicsData.engine.coolantTemp || 0;
    }
    
    // Simple heuristic scoring
    let riskScore = 0;
    if (engineMetrics.faultCodes > 0) riskScore += 30;
    if (engineMetrics.maxTemp > 105) riskScore += 20;
    if (engineMetrics.avgRPM > 4000) riskScore += 10;
    
    const recentIssues = history.filter(h => 
      h.status === 'completed' && 
      new Date(h.completion_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ).length;
    
    riskScore += recentIssues * 5;
    
    if (riskScore < 30) return null;
    
    const urgency: MaintenancePrediction['urgency'] = 
      riskScore > 70 ? 'critical' :
      riskScore > 50 ? 'high' :
      riskScore > 30 ? 'medium' : 'low';
    
    return {
      vehicleId: vehicle._id!,
      component: 'Engine',
      predictedFailureDate: new Date(Date.now() + (100 - riskScore) * 24 * 60 * 60 * 1000),
      confidence: Math.min(riskScore, 95),
      recommendedAction: urgency === 'critical' ? 'Immediate inspection required' : 'Schedule engine diagnostic',
      estimatedCost: 500 + (riskScore * 10),
      urgency,
    };
  }

  private predictTireWear(vehicle: any, history: any[]): MaintenancePrediction | null {
    const lastTireReplacement = history.find(h => h.title?.toLowerCase().includes('tire'));
    const distanceSinceReplacement = lastTireReplacement?.distance_since || vehicle.odometer || 0;
    
    const estimatedWearPercent = (distanceSinceReplacement / 60000) * 100; // Tires last ~60,000 km
    
    if (estimatedWearPercent < 70) return null;
    
    const urgency: MaintenancePrediction['urgency'] = 
      estimatedWearPercent > 90 ? 'high' :
      estimatedWearPercent > 80 ? 'medium' : 'low';
    
    return {
      vehicleId: vehicle._id!,
      component: 'Tires',
      predictedFailureDate: new Date(Date.now() + (100 - estimatedWearPercent) * 100 * 24 * 60 * 60 * 1000),
      confidence: Math.min(estimatedWearPercent, 95),
      recommendedAction: urgency === 'high' ? 'Replace tires immediately' : 'Schedule tire rotation and inspection',
      estimatedCost: 400,
      urgency,
    };
  }

  private predictBrakeWear(vehicle: any, history: any[], telematicsData: any): MaintenancePrediction | null {
    const lastBrakeService = history.find(h => h.title?.toLowerCase().includes('brake'));
    const distanceSinceService = lastBrakeService?.distance_since || vehicle.odometer || 0;
    
    // Estimate wear based on driving style from telematics
    let drivingFactor = 1;
    if (telematicsData) {
      const hardBrakes = telematicsData.alerts?.filter((a: any) => a.type === 'hard_brake').length || 0;
      drivingFactor = 1 + (hardBrakes / 100);
    }
    
    const estimatedWearPercent = (distanceSinceService / 50000) * 100 * drivingFactor;
    
    if (estimatedWearPercent < 60) return null;
    
    const urgency: MaintenancePrediction['urgency'] = 
      estimatedWearPercent > 85 ? 'high' :
      estimatedWearPercent > 70 ? 'medium' : 'low';
    
    return {
      vehicleId: vehicle._id!,
      component: 'Brakes',
      predictedFailureDate: new Date(Date.now() + (100 - estimatedWearPercent) * 50 * 24 * 60 * 60 * 1000),
      confidence: Math.min(estimatedWearPercent, 90),
      recommendedAction: urgency === 'high' ? 'Inspect brakes immediately' : 'Schedule brake inspection',
      estimatedCost: 300,
      urgency,
    };
  }
}

export const predictiveMaintenanceService = new PredictiveMaintenanceService();
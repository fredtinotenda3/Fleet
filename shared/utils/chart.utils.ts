// shared/utils/chart.utils.ts

import { formatDate, DATE_FORMATS } from './date.utils';

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface CategoryData {
  name: string;
  value: number;
  percentage?: number;
}

export function transformToTimeSeries<T extends { date: Date; amount: number }>(
  data: T[],
  dateFormat: string = DATE_FORMATS.DISPLAY_SHORT
): ChartDataPoint[] {
  const grouped = new Map<string, number>();
  
  data.forEach(item => {
    const key = formatDate(item.date, dateFormat);
    grouped.set(key, (grouped.get(key) || 0) + item.amount);
  });
  
  return Array.from(grouped.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function transformToCategoryData<T extends { name: string; value: number }>(
  data: T[],
  topN: number = 5
): CategoryData[] {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, topN);
  const total = top.reduce((sum, item) => sum + item.value, 0);
  
  return top.map(item => ({
    ...item,
    percentage: total > 0 ? (item.value / total) * 100 : 0,
  }));
}

export function transformMonthlyTrends<T extends { date: Date; amount: number }>(
  data: T[]
): ChartDataPoint[] {
  const monthlyMap = new Map<string, number>();
  
  data.forEach(item => {
    const monthKey = formatDate(item.date, DATE_FORMATS.MONTH_YEAR);
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + item.amount);
  });
  
  return Array.from(monthlyMap.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => {
      const [aMonth, aYear] = a.date.split(' ');
      const [bMonth, bYear] = b.date.split(' ');
      const aDate = new Date(`${aMonth} 1, ${aYear}`);
      const bDate = new Date(`${bMonth} 1, ${bYear}`);
      return aDate.getTime() - bDate.getTime();
    });
}

export const CHART_COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#8b5cf6',
  gray: '#6b7280',
  palette: ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'],
} as const;

export function getChartColor(index: number): string {
  return CHART_COLORS.palette[index % CHART_COLORS.palette.length];
}
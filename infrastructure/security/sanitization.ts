// infrastructure/security/sanitization.ts

import { z } from 'zod';
import { sanitizeString } from '@/shared/utils/validation.utils';

export class SanitizationService {
  sanitizeInput<T extends Record<string, any>>(input: T): T {
    const sanitized = { ...input };
    
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = sanitizeString(sanitized[key]);
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeInput(sanitized[key]);
      }
    }
    
    return sanitized;
  }
  
  sanitizeQueryParams(params: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // Only allow alphanumeric, hyphens, underscores
        sanitized[key] = value.replace(/[^a-zA-Z0-9\-_]/g, '');
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  validateAndSanitize<T>(schema: z.Schema<T>, data: unknown): T {
    // First validate with Zod
    const validated = schema.parse(data);
    // Then sanitize
    return this.sanitizeInput(validated as any);
  }
  
  escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  preventNoSQLInjection(value: string): string {
    // Remove MongoDB operator characters
    return value.replace(/[$]/g, '');
  }
}

export const sanitization = new SanitizationService();
import { ZodSchema, ZodError } from 'zod';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string[]>;
}

export async function validateWithZod<T>(
  schema: ZodSchema<T>,
  data: unknown
): Promise<ValidationResult<T>> {
  try {
    const validData = await schema.parseAsync(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      error.errors.forEach((err) => {
        const path = err.path.length > 0 ? err.path.join('.') : '_global';
        if (!errors[path]) errors[path] = [];
        errors[path].push(err.message);
      });
      // Log the real field-level errors so we can debug
      console.error('Zod field errors:', JSON.stringify(errors, null, 2));
      console.error('Zod raw issues:', JSON.stringify(error.errors, null, 2));
      return { success: false, errors };
    }
    console.error('Non-Zod validation error:', error);
    return { success: false, errors: { _global: ['Validation failed'] } };
  }
}

export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 1000);
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = { ...obj };
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key] as string) as T[Extract<keyof T, string>];
    }
  }
  return sanitized;
}

export function isValidLicensePlate(plate: string): boolean {
  const regex = /^[A-Z0-9-]{1,20}$/i;
  return regex.test(plate);
}

export function isValidVIN(vin: string): boolean {
  const regex = /^[A-HJ-NPR-Z0-9]{17}$/i;
  return regex.test(vin);
}
// infrastructure/security/sanitization.ts

export class SanitizationService {
  sanitizeString(input: string): string {
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .trim()
      .slice(0, 1000);
  }

  sanitizeInput<T extends Record<string, unknown>>(input: T): T {
    const sanitized = { ...input };
    for (const key in sanitized) {
      const val = sanitized[key];
      if (typeof val === 'string') {
        sanitized[key] = this.sanitizeString(val) as T[Extract<keyof T, string>];
      } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        sanitized[key] = this.sanitizeInput(
          val as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      }
    }
    return sanitized;
  }

  preventNoSQLInjection(value: string): string {
    return value.replace(/[$]/g, '');
  }

  escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export const sanitization = new SanitizationService();
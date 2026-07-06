// frontend/shared/ui/auth/PasswordStrengthMeter.tsx

'use client';

import { useMemo } from 'react';

interface PasswordStrengthMeterProps {
  password: string;
}

type Strength = 0 | 1 | 2 | 3 | 4;

const LABELS: Record<Strength, string> = {
  0: 'Very weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
};

const COLORS: Record<Strength, string> = {
  0: 'var(--danger)',
  1: 'var(--danger)',
  2: 'var(--warning)',
  3: 'var(--success)',
  4: 'var(--success)',
};

/**
 * Client-side visual guidance only — never the source of truth for
 * password acceptance. The server enforces the real policy (see
 * shared/validations/auth.schema.ts / password-policy service); this
 * meter exists purely to help the person choose a stronger password
 * before submitting.
 */
function scorePassword(password: string): Strength {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(4, score) as Strength;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = useMemo(() => scorePassword(password), [password]);

  if (!password) return null;

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" role="presentation">
        {[0, 1, 2, 3].map((segment) => (
          <div
            key={segment}
            className="flex-1 h-1 transition-colors duration-150 rounded-full"
            style={{ background: segment <= strength - 1 || (strength === 0 && segment === 0 && password) ? COLORS[strength] : 'var(--border)' }}
          />
        ))}
      </div>
      <p className="mt-1 text-caption" style={{ color: COLORS[strength] }}>
        {LABELS[strength]}
      </p>
    </div>
  );
}
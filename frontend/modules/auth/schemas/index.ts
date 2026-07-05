
// 
//
// Client-side mirrors of shared/validations/auth.schema.ts,
// mfa.schema.ts, and session.schema.ts, used with
// @hookform/resolvers/zod on the frontend forms in this module. Keep
// these in sync with the server-side schemas they front.

import { z } from 'zod';

export const loginFormSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  code: z.string().optional(),
  backupCode: z.string().optional(),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const forgotPasswordFormSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;

export const resetPasswordFormSchema = z
  .object({
    newPassword: z.string().min(8, 'Must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Must be at least 8 characters'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Must be at least 8 characters'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export const mfaCodeFormSchema = z.object({
  code: z.string().length(6, 'Enter the 6-digit code').optional(),
  backupCode: z.string().optional(),
});
export type MfaCodeFormValues = z.infer<typeof mfaCodeFormSchema>;

export const mfaEnrollVerifyFormSchema = z.object({
  code: z.string().length(6, 'Enter the 6-digit code from your authenticator app'),
});
export type MfaEnrollVerifyFormValues = z.infer<typeof mfaEnrollVerifyFormSchema>;

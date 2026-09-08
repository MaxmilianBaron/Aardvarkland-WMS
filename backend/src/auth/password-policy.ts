import { BadRequestException } from '@nestjs/common';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const PASSWORD_POLICY_MESSAGE =
  'Password must be 12-128 characters and include uppercase, lowercase, number, and symbol characters.';

const PLACEHOLDER_PASSWORD_PATTERNS = [
  /change\s*me/i,
  /change[-_\s]*before/i,
  /replace[-_\s]*with/i,
  /password/i,
  /admin/i,
  /demo/i,
  /1234/,
];

export interface PasswordPolicyOptions {
  rejectPlaceholders?: boolean;
}

export interface PasswordPolicyResult {
  valid: boolean;
  issues: string[];
}

export function validatePasswordStrength(
  password: string,
  options: PasswordPolicyOptions = {},
): PasswordPolicyResult {
  const issues: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    issues.push(`at most ${MAX_PASSWORD_LENGTH} characters`);
  }

  if (!/[a-z]/.test(password)) {
    issues.push('a lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    issues.push('an uppercase letter');
  }

  if (!/\d/.test(password)) {
    issues.push('a number');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push('a symbol');
  }

  if (options.rejectPlaceholders && containsPasswordPlaceholder(password)) {
    issues.push('no placeholder words such as change-me, demo, admin, password, or 1234');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertStrongPassword(
  password: string,
  options: PasswordPolicyOptions = {},
): void {
  const result = validatePasswordStrength(password, options);

  if (!result.valid) {
    throw new BadRequestException(`${PASSWORD_POLICY_MESSAGE} Missing: ${result.issues.join(', ')}.`);
  }
}

export function containsPasswordPlaceholder(value: string): boolean {
  return PLACEHOLDER_PASSWORD_PATTERNS.some((pattern) => pattern.test(value));
}

import { isValidEmail } from "@/lib/validators";

const INJECTION_PATTERN =
  /(<\s*script|javascript\s*:|data\s*:|on\w+\s*=|\b(union|select|insert|update|delete|drop|exec|sleep|benchmark)\b|--|\/\*|\*\/|;\s*(drop|delete|insert|update))/i;

const FULL_NAME_PATTERN = /^[\p{L}\p{M}'\-\s.]+$/u;

export function stripControlChars(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/** Removes characters commonly used in XSS/SQLi payloads from e-mail input. */
export function sanitizeAuthEmailInput(value: string): string {
  return stripControlChars(value)
    .replace(/[<>"'`;\\]/g, "")
    .slice(0, 254);
}

/** Keeps only safe characters for a person's display name. */
export function sanitizeAuthFullNameInput(value: string): string {
  return stripControlChars(value)
    .replace(/[<>"'`;\\{}[\]()=+*/&|^$~<>]/g, "")
    .slice(0, 120);
}

/** Strips control characters; passwords may contain symbols but not null bytes. */
export function sanitizeAuthPasswordInput(value: string): string {
  return stripControlChars(value).slice(0, 128);
}

export function hasSuspiciousAuthInput(...values: string[]): boolean {
  return values.some((value) => INJECTION_PATTERN.test(value));
}

export type AuthValidationIssue =
  | "suspiciousInput"
  | "invalidEmail"
  | "invalidName"
  | "passwordTooLong";

export function validateAuthForm(input: {
  email: string;
  password: string;
  fullName?: string;
  needsBootstrap?: boolean;
}): AuthValidationIssue | null {
  const email = input.email.trim();
  const password = input.password;
  const fullName = input.fullName?.trim() ?? "";

  if (hasSuspiciousAuthInput(email, password, fullName)) {
    return "suspiciousInput";
  }
  if (!isValidEmail(email)) return "invalidEmail";
  if (password.length > 128) return "passwordTooLong";

  if (input.needsBootstrap) {
    if (!fullName || fullName.length < 2 || !FULL_NAME_PATTERN.test(fullName)) {
      return "invalidName";
    }
  }

  return null;
}

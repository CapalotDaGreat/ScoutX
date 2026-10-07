export const AUTH_PASSWORD_MIN_LENGTH = 8;

const EMAIL_PATTERN = /.+@.+\..+/;

export type AuthFieldErrors<T extends string> = Partial<Record<T, string>>;

type AuthValidationKey =
  | 'validation:emailRequired'
  | 'validation:emailInvalid'
  | 'validation:passwordRequired'
  | 'validation:passwordMinLength'
  | 'validation:confirmPasswordRequired'
  | 'validation:passwordMismatch';

type TranslateFn = (key: AuthValidationKey, options?: { count: number }) => string;

export function validateEmailField(
  email: string,
  t: TranslateFn,
): string | undefined {
  if (!email.trim()) {
    return t('validation:emailRequired');
  }
  if (!EMAIL_PATTERN.test(email)) {
    return t('validation:emailInvalid');
  }
  return undefined;
}

export function validatePasswordField(
  password: string,
  t: TranslateFn,
): string | undefined {
  if (!password.trim()) {
    return t('validation:passwordRequired');
  }
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
    return t('validation:passwordMinLength', { count: AUTH_PASSWORD_MIN_LENGTH });
  }
  return undefined;
}

export function validatePasswordConfirmation(
  password: string,
  confirmPassword: string,
  t: TranslateFn,
): AuthFieldErrors<'password' | 'confirmPassword'> {
  const errors: AuthFieldErrors<'password' | 'confirmPassword'> = {};
  const passwordError = validatePasswordField(password, t);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (!confirmPassword.trim()) {
    errors.confirmPassword = t('validation:confirmPasswordRequired');
  } else if (confirmPassword !== password) {
    errors.confirmPassword = t('validation:passwordMismatch');
  }

  return errors;
}

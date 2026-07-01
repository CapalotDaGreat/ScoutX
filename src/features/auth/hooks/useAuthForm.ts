import { useMemo, useState } from 'react';
import { type AuthRole } from '@/features/auth/types';

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export function useAuthForm<T extends Record<string, string>>(initialValues: T) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>({});

  const updateValue = (key: keyof T, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (validator: (values: T) => FormErrors<T>) => {
    const nextErrors = validator(values);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const reset = () => {
    setValues(initialValues);
    setErrors({});
  };

  return useMemo(
    () => ({
      values,
      errors,
      updateValue,
      validate,
      reset,
      setValues,
      setErrors,
    }),
    [errors, values],
  );
}

export function useAuthRoleSelection(initialRole: AuthRole | null = null) {
  const [role, setRole] = useState<AuthRole | null>(initialRole);
  return { role, setRole };
}

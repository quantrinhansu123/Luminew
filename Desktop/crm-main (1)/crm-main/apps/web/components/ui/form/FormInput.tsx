'use client';
import { useFormContext } from 'react-hook-form';

interface FormInputProps {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'date';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export function FormInput({
  name, label, type = 'text', placeholder, required, disabled
}: FormInputProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name];

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        {...register(name, { valueAsNumber: type === 'number' })}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg outline-none transition-colors
          ${error
            ? 'border-red-500 focus:ring-2 focus:ring-red-500'
            : 'border-slate-300 focus:ring-2 focus:ring-accent'}
          ${disabled ? 'bg-slate-100 cursor-not-allowed' : 'bg-white'}
        `}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error.message as string}</p>}
    </div>
  );
}

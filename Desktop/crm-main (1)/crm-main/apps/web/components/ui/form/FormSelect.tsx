'use client';
import { useFormContext } from 'react-hook-form';

interface FormSelectProps {
  name: string;
  label: string;
  options: Array<{ value: number | string; label: string }>;
  required?: boolean;
  emptyOption?: string;
  disabled?: boolean;
  onValueChange?: (rawValue: string) => void;
}

export function FormSelect({
  name, label, options, required, emptyOption, disabled, onValueChange
}: FormSelectProps) {
  const { register, formState: { errors } } = useFormContext();
  const error = errors[name];
  const allNumeric = options.length > 0 && options.every((o) => typeof o.value === 'number');
  const registered = register(name, {
    setValueAs: allNumeric
      ? (v) => (v === '' ? undefined : Number(v))
      : undefined,
  });

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        {...registered}
        onChange={(e) => {
          registered.onChange(e);
          onValueChange?.(e.target.value);
        }}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg outline-none transition-colors
          ${error
            ? 'border-red-500 focus:ring-2 focus:ring-red-500'
            : 'border-slate-300 focus:ring-2 focus:ring-accent'}
          ${disabled ? 'bg-slate-100 cursor-not-allowed' : 'bg-white'}
        `}
      >
        {emptyOption && <option value="">{emptyOption}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-red-600">{error.message as string}</p>}
    </div>
  );
}

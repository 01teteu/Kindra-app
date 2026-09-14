import { InputHTMLAttributes, forwardRef, useId, useState } from 'react';
import { cn } from '../../lib/utils';
import { Eye, EyeOff } from 'lucide-react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type, title, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const describedBy =
      [props['aria-describedby'], error ? `${inputId}-error` : null].filter(Boolean).join(' ') ||
      undefined;
    return (
      <div className="flex flex-col gap-2 w-full min-w-0">
        {title && (
          <label htmlFor={inputId} className="text-sm font-medium text-kindra-700">
            {title}
          </label>
        )}
        <div className="relative flex items-center w-full">
          <input
            {...props}
            ref={ref}
            id={inputId}
            type={isPassword && showPassword ? 'text' : type}
            aria-label={props['aria-label'] || (!title ? props.placeholder : undefined)}
            aria-invalid={error ? true : props['aria-invalid']}
            aria-describedby={describedBy}
            className={cn('kindra-input', isPassword && 'pr-14', error && 'input-error', className)}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
              className="absolute right-1 grid place-items-center w-11 h-11 text-kindra-600 hover:text-kindra-950 rounded-lg"
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          )}
        </div>
        {error && (
          <span id={`${inputId}-error`} role="alert" className="text-xs text-rose-400">
            {error}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

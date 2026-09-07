import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Eye, EyeOff } from 'lucide-react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPasswordField = type === 'password';
    const inputType = isPasswordField ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className="flex flex-col gap-1 w-full">
        <div className="relative flex items-center w-full group">
          <input
            ref={ref}
            type={inputType}
            className={cn(
              'flex h-12 w-full rounded-full bg-kindra-200/50 pl-6 pr-12 py-2 text-sm text-kindra-950 placeholder:text-kindra-500 font-medium',
              'border border-kindra-300 focus:bg-kindra-100 focus:border-kindra-500 focus:ring-4 focus:ring-kindra-500/10 focus:outline-none transition-all duration-300',
              '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
              className
            )}
            {...props}
          />
          {isPasswordField && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 text-kindra-400 hover:text-kindra-900 transition-colors focus:outline-none focus:text-kindra-900"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}
        </div>
        {error && <span className="text-xs text-red-500 ml-4">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';

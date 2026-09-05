import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'solid', isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center rounded-full px-6 py-3 font-semibold transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-kindra-400 focus:ring-offset-2 focus:ring-offset-kindra-base disabled:opacity-50 disabled:pointer-events-none',
          variant === 'solid' && 'bg-kindra-950 text-kindra-base hover:bg-kindra-800 shadow-sm hover:shadow-md',
          variant === 'outline' && 'border border-kindra-300 bg-transparent text-kindra-950 hover:bg-kindra-200 hover:border-kindra-400',
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

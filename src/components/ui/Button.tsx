import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-teal-500 text-white hover:bg-teal-600 focus:ring-teal-500 border border-transparent shadow-sm hover:shadow',
      secondary: 'bg-kindra-900 text-white hover:bg-kindra-800 focus:ring-kindra-900 border border-transparent shadow-sm',
      outline: 'border-2 border-kindra-200 bg-transparent hover:bg-kindra-50 text-kindra-900 focus:ring-kindra-900',
      ghost: 'bg-transparent hover:bg-kindra-100 text-kindra-700 focus:ring-kindra-200',
      danger: 'bg-rose-500 text-white hover:bg-rose-600 focus:ring-rose-500 border border-transparent shadow-sm',
    };

    const sizes = {
      sm: 'h-9 px-4 text-xs rounded-xl',
      md: 'h-11 px-6 text-sm rounded-2xl',
      lg: 'h-14 px-8 text-base rounded-[20px]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center font-display font-bold tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

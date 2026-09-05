import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[2rem] bg-kindra-100 p-8 shadow-xl shadow-black/5 border border-kindra-200/50 backdrop-blur-xl',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

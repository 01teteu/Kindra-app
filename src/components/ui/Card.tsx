import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[32px] bg-kindra-100 border border-kindra-200/50 shadow-xl shadow-black/20',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

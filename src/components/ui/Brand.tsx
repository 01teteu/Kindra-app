import { Flame } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="kindra-brand" aria-label="Kindra">
      <span className="kindra-brand-mark">
        <Flame size={21} strokeWidth={1.7} aria-hidden="true" />
      </span>
      {!compact && (
        <span>
          kindra<span className="text-teal-400">.</span>
        </span>
      )}
    </div>
  );
}

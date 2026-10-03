export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="kindra-brand" aria-label="Kindra">
      <span className="kindra-brand-mark">
        <img src="/favicon-32x32.png" srcSet="/favicon-32x32.png 1x, /android-chrome-192x192.png 2x" width={28} height={28} alt="" aria-hidden="true" />
      </span>
      {!compact && (
        <span>
          kindra<span className="text-teal-400">.</span>
        </span>
      )}
    </div>
  );
}

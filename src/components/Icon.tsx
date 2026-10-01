export function Icon({ path, size = 24 }: { path: string; size?: number | string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

// Hand-recreated as SVG (no source file was available) from a reference design:
// a "TF" monogram — T upper-left, F lower-right, both stems ending in a matching
// angled "blade" tip — plus a bold two-tone "TestForge" wordmark.

export function LogoIcon({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const dark = inverted ? '#FFFFFF' : '#0F1B2D';
  const blue = inverted ? '#6C8CFF' : '#3B5BDB';
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 24 L28 24 L28 54 L23 62 L18 54 L18 24 Z" fill={blue} />
      <path d="M28 24 L54 24 L54 32 L28 32 Z" fill={blue} />
      <path d="M28 36 L46 36 L46 44 L28 44 Z" fill={blue} />
      <path d="M2 4 L26 4 L26 12 L2 12 Z" fill={dark} />
      <path d="M10 12 L18 12 L18 38 L14 46 L10 38 Z" fill={dark} />
    </svg>
  );
}

export function LogoWordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={`font-extrabold tracking-tight ${className ?? ''}`}>
      <span className={inverted ? 'text-white' : 'text-[#0F1B2D]'}>Test</span>
      <span className={inverted ? 'text-[#6C8CFF]' : 'text-[#3B5BDB]'}>Forge</span>
    </span>
  );
}

export function Logo({ className, iconClassName, inverted = false }: { className?: string; iconClassName?: string; inverted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoIcon inverted={inverted} className={iconClassName ?? 'h-6 w-6'} />
      <LogoWordmark inverted={inverted} className="text-lg" />
    </span>
  );
}

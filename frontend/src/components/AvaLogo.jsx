export const AvaLogo = ({ size = 40, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-label="AVA">
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#0A0A0C" />
    <rect x="2" y="2" width="60" height="60" rx="14" stroke="#E50914" strokeWidth="2.5" />
    <path d="M32 12 L46 50 H38 L35.2 41 H28.8 L26 50 H18 L32 12 Z" fill="#E50914" />
    <path d="M32 27 L30.4 35 H33.6 L32 27 Z" fill="#0A0A0C" />
    <circle cx="32" cy="52" r="2.5" fill="#FFFFFF" />
  </svg>
);

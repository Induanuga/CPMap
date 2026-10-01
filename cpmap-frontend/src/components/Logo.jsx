export default function Logo({ size = 'medium', className = '' }) {
  const iconSizes = {
    small: { icon: 26, text: '1.15rem' },
    medium: { icon: 34, text: '1.45rem' },
    large: { icon: 48, text: '1.95rem' },
  };

  const currentSize = iconSizes[size] || iconSizes.medium;

  return (
    <div
      className={`brand-logo ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        textDecoration: 'none',
        userSelect: 'none',
      }}
    >
      {/* Geometric Icon - Exact structure with transparent center cutout hole */}
      <svg
        width={currentSize.icon}
        height={currentSize.icon}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Top-Left Facet (Indigo to Primary Blue Gradient) */}
        <path
          d="M 4 4 H 20 V 11 H 11 V 20 H 4 V 4 Z"
          fill="url(#blue-facet-grad)"
        />

        {/* Right & Bottom Folded Facet (Blue to Primary Teal Gradient) */}
        <path
          d="M 20 4 L 28 12 V 28 H 12 L 4 20 H 11 V 20 H 20 V 11 H 20 Z"
          fill="url(#teal-facet-grad)"
        />

        {/* Center is left completely open as a transparent hole cutout! */}

        <defs>
          {/* Primary Navy Facet Gradient */}
          <linearGradient id="blue-facet-grad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#46548B" />
            <stop offset="1" stopColor="#344070" />
          </linearGradient>

          {/* Accent Sky Blue Facet Gradient */}
          <linearGradient id="teal-facet-grad" x1="20" y1="4" x2="12" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#46548B" />
            <stop offset="1" stopColor="#C6E5FF" />
          </linearGradient>
        </defs>
      </svg>

      {/* Typography: CP Map */}
      <span
        style={{
          fontSize: currentSize.text,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          fontFamily: "'Inter', 'Poppins', system-ui, -apple-system, sans-serif",
          lineHeight: 1,
        }}
      >
        <span style={{ color: '#46548B' }}>CP</span>{' '}
        <span style={{ color: '#46548B' }}>Map</span>
      </span>
    </div>
  );
}

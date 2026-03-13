import { useRef, useEffect } from 'react';
import { Mode, applyMode } from '@cloudscape-design/global-styles';

export default function Footer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) applyMode(Mode.Dark, ref.current);
  }, []);

  return (
    <div ref={ref} style={{
      textAlign: 'center',
      padding: '12px 0',
      backgroundColor: 'var(--color-background-container-content-6u8rvp, #0f1b2a)',
      fontFamily: "var(--font-family-base, 'Open Sans', 'Helvetica Neue', Roboto, Arial, sans-serif)",
      fontSize: 'var(--font-size-body-s, 12px)',
      color: 'rgba(255, 255, 255, 0.9)',
    }}>
      PrivateMCP v{__APP_VERSION__} &middot;{' '}
      <a
        href="https://github.com/rusty428/private-mcp"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'rgba(255, 255, 255, 0.9)', textDecoration: 'underline' }}
      >
        Source
      </a>
      {' '}&middot; Made with &#10084; in Seattle
    </div>
  );
}

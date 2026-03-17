import { useDemoMode } from '../contexts/DemoContext';

export function DemoBanner() {
  const { isDemoMode } = useDemoMode();
  if (!isDemoMode) return null;

  return (
    <div style={{
      background: '#B8860B',
      color: '#fff',
      textAlign: 'center',
      padding: '8px 16px',
      fontSize: '14px',
      fontWeight: 600,
    }}>
      You're viewing demo data
    </div>
  );
}

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import AppLayout from '@cloudscape-design/components/app-layout';
import SideNavigation from '@cloudscape-design/components/side-navigation';
import Footer from './components/Footer';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import type { ThemePreference } from './theme/ThemeContext';
import { setDemoMode } from './api/client';
import { DemoProvider, useDemoMode } from './contexts/DemoContext';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Browse } from './pages/Browse/Browse';
import { Search } from './pages/Search/Search';
import { Reports } from './pages/Reports/Reports';
import { Capture } from './pages/Capture/Capture';
import { Settings } from './pages/Settings/Settings';

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function DemoSync() {
  const { isDemoMode } = useDemoMode();
  useEffect(() => { setDemoMode(isDemoMode); }, [isDemoMode]);
  return null;
}

function AppContent() {
  const [navigationOpen, setNavigationOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { preference, setPreference } = useTheme();
  const { isDemoMode } = useDemoMode();

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'Dashboard',
      '/browse': 'Browse',
      '/search': 'Search',
      '/reports': 'Reports',
      '/capture': 'Capture',
      '/settings': 'Settings',
    };
    const page = titles[location.pathname] || 'PrivateMCP';
    document.title = page === 'PrivateMCP' ? page : `${page} - PrivateMCP`;
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopNavigation
        identity={{
          href: '/',
          title: isDemoMode ? 'PrivateMCP — Demo Mode' : 'PrivateMCP',
          onFollow: (e) => {
            e.preventDefault();
            navigate('/');
          },
        }}
        utilities={[
          {
            type: 'menu-dropdown',
            iconName: 'settings',
            ariaLabel: 'Settings',
            title: 'Settings',
            items: (['system', 'light', 'dark'] as ThemePreference[]).map((p) => ({
              id: p,
              text: `${THEME_LABELS[p]}${preference === p ? ' \u2713' : ''}`,
            })),
            onItemClick: ({ detail }) => setPreference(detail.id as ThemePreference),
          },
        ]}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <AppLayout
          navigationOpen={navigationOpen}
          onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
          toolsHide
          navigationWidth={160}
          navigation={
            <SideNavigation
              activeHref={location.pathname}
              items={[
                { type: 'link', text: 'Dashboard', href: '/' },
                { type: 'link', text: 'Browse', href: '/browse' },
                { type: 'link', text: 'Search', href: '/search' },
                { type: 'link', text: 'Reports', href: '/reports' },
                { type: 'link', text: 'Capture', href: '/capture' },
                { type: 'link', text: 'Settings', href: '/settings' },
              ]}
              onFollow={(e) => {
                e.preventDefault();
                navigate(e.detail.href);
              }}
            />
          }
          content={
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/search" element={<Search />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/capture" element={<Capture />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          }
        />
      </div>
      <Footer />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <DemoProvider>
        <DemoSync />
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </DemoProvider>
    </BrowserRouter>
  );
}

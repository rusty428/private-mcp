import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import AppLayout from '@cloudscape-design/components/app-layout';
import SideNavigation from '@cloudscape-design/components/side-navigation';
import Footer from './components/Footer';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Browse } from './pages/Browse/Browse';
import { Search } from './pages/Search/Search';
import { Reports } from './pages/Reports/Reports';
import { Capture } from './pages/Capture/Capture';

function AppContent() {
  const [navigationOpen, setNavigationOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopNavigation
        identity={{
          href: '/',
          title: 'PrivateMCP',
          onFollow: (e) => {
            e.preventDefault();
            navigate('/');
          },
        }}
        utilities={[]}
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
      <AppContent />
    </BrowserRouter>
  );
}

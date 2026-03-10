import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import AppLayout from '@cloudscape-design/components/app-layout';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Browse } from './pages/Browse/Browse';
import { Search } from './pages/Search/Search';
import { Reports } from './pages/Reports/Reports';
import { Capture } from './pages/Capture/Capture';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { id: 'dashboard', text: 'Dashboard', href: '/' },
    { id: 'browse', text: 'Browse', href: '/browse' },
    { id: 'search', text: 'Search', href: '/search' },
    { id: 'reports', text: 'Reports', href: '/reports' },
    { id: 'capture', text: 'Capture', href: '/capture' },
  ];

  return (
    <>
      <TopNavigation
        identity={{ href: '/', title: 'PrivateMCP' }}
        utilities={navItems.map((item) => ({
          type: 'button',
          text: item.text,
          onClick: () => navigate(item.href),
        }))}
      />
      <AppLayout
        navigationHide
        toolsHide
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
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

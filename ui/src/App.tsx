import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import AppLayout from '@cloudscape-design/components/app-layout';

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
            <Route path="/" element={<div>Dashboard (coming next)</div>} />
            <Route path="/browse" element={<div>Browse</div>} />
            <Route path="/search" element={<div>Search</div>} />
            <Route path="/reports" element={<div>Reports</div>} />
            <Route path="/capture" element={<div>Capture</div>} />
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

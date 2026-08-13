import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import MaterialOrdersPage from './pages/MaterialOrdersPage';
import InventoryPage from './pages/InventoryPage';
import BomPage from './pages/BomPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/orders" replace />} />
            <Route path="/orders" element={<MaterialOrdersPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/bom" element={<BomPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import TasksPage from './pages/TasksPage';
import MachinesPage from './pages/MachinesPage';
import WorkerDashboard from './pages/WorkerDashboard';
import AnalyticsPage from './pages/AnalyticsPage';
import UsersPage from './pages/UsersPage';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center theme-bg">
      <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'supervisor') return <Navigate to="/supervisor" replace />;
    return <Navigate to="/worker" replace />;
  }
  return children;
}

function ToasterWithTheme() {
  const { isDark } = useTheme();
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: isDark
          ? { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' }
          : { background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' },
        success: { iconTheme: { primary: '#10b981', secondary: isDark ? '#f1f5f9' : '#fff' } },
        error: { iconTheme: { primary: '#ef4444', secondary: isDark ? '#f1f5f9' : '#fff' } },
      }}
    />
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? (
        user.role === 'admin' ? <Navigate to="/admin" /> :
          user.role === 'supervisor' ? <Navigate to="/supervisor" /> :
            <Navigate to="/worker" />
      ) : <Login />} />

      <Route path="/register" element={user ? <Navigate to="/login" /> : <Register />} />

      {/* Admin */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AdminDashboard /></Layout></ProtectedRoute>} />
      <Route path="/admin/tasks" element={<ProtectedRoute allowedRoles={['admin']}><Layout><TasksPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/machines" element={<ProtectedRoute allowedRoles={['admin']}><Layout><MachinesPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><Layout><UsersPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AnalyticsPage /></Layout></ProtectedRoute>} />

      {/* Supervisor */}
      <Route path="/supervisor" element={<ProtectedRoute allowedRoles={['supervisor']}><Layout><AdminDashboard /></Layout></ProtectedRoute>} />
      <Route path="/supervisor/tasks" element={<ProtectedRoute allowedRoles={['supervisor']}><Layout><TasksPage /></Layout></ProtectedRoute>} />
      <Route path="/supervisor/machines" element={<ProtectedRoute allowedRoles={['supervisor']}><Layout><MachinesPage /></Layout></ProtectedRoute>} />
      <Route path="/supervisor/analytics" element={<ProtectedRoute allowedRoles={['supervisor']}><Layout><AnalyticsPage /></Layout></ProtectedRoute>} />

      {/* Worker */}
      <Route path="/worker" element={<ProtectedRoute allowedRoles={['worker']}><Layout><WorkerDashboard /></Layout></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

import { LanguageProvider } from './context/LanguageContext';

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <SocketProvider>
              <AppRoutes />
              <ToasterWithTheme />
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

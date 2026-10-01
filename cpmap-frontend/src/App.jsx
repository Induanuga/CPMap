import { Routes, Route, Navigate } from 'react-router-dom';
import Register                from './pages/Register';
import Login                   from './pages/Login';
import Search                  from './pages/Search';
import CPForm                  from './pages/CPForm';
import CollectorDashboard      from './pages/CollectorDashboard';
import MySubmissions           from './pages/MySubmissions';
import ModeratorDashboard      from './pages/ModeratorDashboard';
import SubmissionReviewDetail  from './pages/SubmissionReviewDetail';
import AdminDashboard          from './pages/AdminDashboard';
import AdminCareerPath         from './pages/AdminCareerPath';
import CareerPathDetail      from './pages/CareerPathDetail';
import EditProfile             from './pages/EditProfile';
import ProtectedRoute          from './components/ProtectedRoute';
import Navbar                  from './components/Navbar';
import { isAuthenticated, getUser } from './utils/auth';

function WithNavbar({ children }) {
  return (
    <>
      <Navbar />
      <div className="page-content">{children}</div>
    </>
  );
}

function RoleRedirect() {
  // Unauthenticated users go to search (public page with sign-in prompt)
  if (!isAuthenticated()) return <Navigate to="/search" replace />;
  const role = getUser()?.role;
  if (role === 'admin')     return <Navigate to="/admin" replace />;
  if (role === 'moderator') return <Navigate to="/moderator-dashboard" replace />;
  if (role === 'collector') return <Navigate to="/collector" replace />;
  return <Navigate to="/search" replace />;
}

function App() {
  return (
    <Routes>
      {/* Public: only register and login */}
      <Route path="/register" element={<Register />} />
      <Route path="/login"    element={<Login />} />

      {/* Search & Detail: public */}
      <Route path="/search" element={
        <WithNavbar><Search /></WithNavbar>
      } />
      <Route path="/career-path/:id" element={
        <WithNavbar><CareerPathDetail /></WithNavbar>
      } />

      {/* Edit Profile (authenticated) */}
      <Route path="/edit-profile" element={
        <ProtectedRoute>
          <WithNavbar><EditProfile /></WithNavbar>
        </ProtectedRoute>
      } />

      {/* User: submit own path */}
      <Route path="/cp-form" element={
        <ProtectedRoute roles={['user', 'admin']}>
          <WithNavbar><CPForm /></WithNavbar>
        </ProtectedRoute>
      } />

      {/* Collector dashboard */}
      <Route path="/collector" element={
        <ProtectedRoute roles={['collector', 'admin']}>
          <WithNavbar><CollectorDashboard /></WithNavbar>
        </ProtectedRoute>
      } />

      {/* View my submissions: user, collector, admin */}
      <Route path="/my-submissions" element={
        <ProtectedRoute roles={['user', 'collector', 'admin']}>
          <WithNavbar><MySubmissions /></WithNavbar>
        </ProtectedRoute>
      } />

      {/* Moderator dashboard */}
      <Route path="/moderator-dashboard" element={
        <ProtectedRoute roles={['moderator', 'admin']}>
          <WithNavbar><ModeratorDashboard /></WithNavbar>
        </ProtectedRoute>
      } />

      {/* Moderator: view & review submission details */}
      <Route path="/submission-review/:id" element={
        <ProtectedRoute roles={['moderator', 'admin']}>
          <WithNavbar><SubmissionReviewDetail /></WithNavbar>
        </ProtectedRoute>
      } />

      {/* Admin dashboard */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['admin']}>
          <WithNavbar><AdminDashboard /></WithNavbar>
        </ProtectedRoute>
      } />
      <Route path="/admin/path/:id" element={
        <ProtectedRoute roles={['admin']}>
          <WithNavbar><AdminCareerPath /></WithNavbar>
        </ProtectedRoute>
      } />

      {/* Default redirect based on role */}
      <Route path="/"        element={<RoleRedirect />} />
      <Route path="/default" element={<Navigate to="/search" replace />} />
      <Route path="*"        element={<RoleRedirect />} />
    </Routes>
  );
}

export default App;

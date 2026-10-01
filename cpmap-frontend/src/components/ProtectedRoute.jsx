import { Navigate } from 'react-router-dom';
import { isAuthenticated, getUser } from '../utils/auth';

/**
 * ProtectedRoute
 * @param {string[]} roles  — optional list of allowed roles; if omitted any authenticated user passes
 */
export default function ProtectedRoute({ children, roles }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0) {
    const user = getUser();
    if (!user || !roles.includes(user.role)) {
      // Redirect to their own dashboard instead of a blank 403
      const role = user?.role;
      if (role === 'admin') return <Navigate to="/admin" replace />;
      if (role === 'moderator') return <Navigate to="/moderator-dashboard" replace />;
      if (role === 'collector') return <Navigate to="/collector" replace />;
      return <Navigate to="/search" replace />;
    }
  }

  return children;
}

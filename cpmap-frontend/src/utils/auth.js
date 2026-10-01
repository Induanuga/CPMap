// Token helpers
export const getToken = () => localStorage.getItem('cpmap_token');
export const setToken = (token) => localStorage.setItem('cpmap_token', token);
export const removeToken = () => localStorage.removeItem('cpmap_token');
export const isAuthenticated = () => !!getToken();

export const getUser = () => {
  try {
    const raw = localStorage.getItem('cpmap_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
export const setUser = (user) => localStorage.setItem('cpmap_user', JSON.stringify(user));
export const removeUser = () => localStorage.removeItem('cpmap_user');

export const logout = () => {
  removeToken();
  removeUser();
};

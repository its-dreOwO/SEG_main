import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);
// The session cookie is HttpOnly, so a flag records that a session may exist; it avoids a pointless 401 on every first visit.
const FLAG = 'volt.session';
const hasFlag = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
const setFlag = (on) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* ignore */ } };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(hasFlag());

  useEffect(() => {
    if (!hasFlag()) return;
    api('/me')
      .then(setUser)
      .catch(() => setFlag(false))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setFlag(true);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (display_name, email, password) => {
    const { user: u } = await api('/auth/register', { method: 'POST', body: { display_name, email, password } });
    setFlag(true);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setFlag(false);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, setUser }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

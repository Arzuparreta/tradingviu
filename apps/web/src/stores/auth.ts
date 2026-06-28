import { create } from 'zustand';
import { api, getToken, setToken, clearToken } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (body: { email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  bootstrap: async () => {
    if (!getToken()) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const me = await api.me();
      if ('user' in me && me.user) {
        set({ user: me.user, loading: false });
      } else {
        clearToken();
        set({ user: null, loading: false });
      }
    } catch {
      clearToken();
      set({ user: null, loading: false });
    }
  },
  login: async (email, password) => {
    const r = await api.login({ email, password });
    setToken(r.token);
    set({ user: r.user });
  },
  signup: async (body) => {
    const r = await api.signup(body);
    setToken(r.token);
    set({ user: r.user });
  },
  logout: async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    clearToken();
    set({ user: null });
  },
}));

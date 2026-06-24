import { create } from 'zustand';
import { api, getToken, setToken, clearToken } from '../api/client';
import type { User, Tenant } from '../api/types';

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  loading: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (body: { email: string; password: string; displayName?: string; tenantName?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  loading: true,
  bootstrap: async () => {
    if (!getToken()) {
      set({ user: null, tenant: null, loading: false });
      return;
    }
    try {
      const me = await api.me();
      if ('user' in me && me.user) {
        set({ user: me.user, tenant: 'tenant' in me ? me.tenant ?? null : null, loading: false });
      } else {
        clearToken();
        set({ user: null, tenant: null, loading: false });
      }
    } catch {
      clearToken();
      set({ user: null, tenant: null, loading: false });
    }
  },
  login: async (email, password) => {
    const r = await api.login({ email, password });
    setToken(r.token);
    set({ user: r.user, tenant: r.tenant });
  },
  signup: async (body) => {
    const r = await api.signup(body);
    setToken(r.token);
    set({ user: r.user, tenant: r.tenant });
  },
  logout: async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    clearToken();
    set({ user: null, tenant: null });
  },
}));

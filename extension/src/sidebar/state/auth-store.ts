import { create } from 'zustand';

export type AuthStatus = 'checking' | 'signed-out' | 'signed-in' | 'signing-in';

interface AuthState {
  status: AuthStatus;
  errorMessage: string | null;
  setStatus: (status: AuthStatus) => void;
  setError: (message: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'checking',
  errorMessage: null,
  setStatus: (status) => set({ status, errorMessage: null }),
  setError: (message) => set({ status: 'signed-out', errorMessage: message }),
}));

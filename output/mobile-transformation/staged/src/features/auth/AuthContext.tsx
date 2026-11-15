import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "../../types/supplify";
import {
  ApiError,
  api,
  setApiAuthStateListener,
} from "../../services/api/client";
import {
  loginWithKeycloak,
  endKeycloakSession,
  completeWebOAuthCallbackIfNeeded,
} from "./keycloakAuth";
import { ensureValidAccessToken } from "./session";
import { clearTokens, getAccessToken, getIdToken } from "./tokenStorage";
import { unregisterStoredPushDevice } from "../../services/pushRegistration";
import { businessSessionKey, resetBusinessSession } from "./sessionIsolation";
import { assertRequestScope, getRequestScopeVersion } from "./requestScope";

type AuthState = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  register: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  billingLocked: boolean;
  clearBillingLock: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useUiLocale();

  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [billingLocked, setBillingLocked] = useState(false);
  const bootstrapStarted = useRef(false);
  const scope = useRef<string | null>(null);

  const setSessionUser = useCallback(
    (next: User | null) => {
      const nextScope = businessSessionKey(next);
      if (scope.current !== nextScope || next === null) {
        resetBusinessSession(queryClient);
        scope.current = nextScope;
      }
      setUser(next);
    },
    [queryClient],
  );

  const refreshUser = useCallback(async () => {
    const requestScope = getRequestScopeVersion();
    const token = await getAccessToken();
    assertRequestScope(requestScope);
    if (!token) {
      setSessionUser(null);
      return;
    }
    const me = await api.get<User>("/auth/me");
    assertRequestScope(requestScope);
    setSessionUser(me);
  }, [setSessionUser]);

  useEffect(
    () =>
      setApiAuthStateListener((status) => {
        if (status === 402) setBillingLocked(true);
        if (status === 401) setSessionUser(null);
      }),
    [setSessionUser],
  );

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    (async () => {
      try {
        await completeWebOAuthCallbackIfNeeded();
        const hasSession = await ensureValidAccessToken();
        if (!hasSession) {
          setSessionUser(null);
          return;
        }
        await refreshUser();
      } catch (error) {
        if (error instanceof ApiError && error.status === 402)
          setBillingLocked(true);
        await clearTokens();
        setSessionUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshUser, setSessionUser]);

  const login = useCallback(async () => {
    setIsLoading(true);
    setBillingLocked(false);
    setSessionUser(null);
    try {
      await clearTokens();
      await loginWithKeycloak();
      await refreshUser();
    } catch (error) {
      await clearTokens();
      setSessionUser(null);
      const message =
        error instanceof Error
          ? error.message
          : "Could not complete Keycloak login. Try again.";
      Alert.alert(uiCopy("Sign in failed"), message);
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser, setSessionUser]);

  const register = useCallback(async () => {
    setIsLoading(true);
    setBillingLocked(false);
    setSessionUser(null);
    try {
      await clearTokens();
      await loginWithKeycloak("register");
      await refreshUser();
    } catch (error) {
      await clearTokens();
      setSessionUser(null);
      const message =
        error instanceof Error
          ? error.message
          : "Could not create your account.";
      Alert.alert(uiCopy("Account creation failed"), message);
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser, setSessionUser]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setSessionUser(null);
    setBillingLocked(false);
    try {
      const idToken = await getIdToken();
      try {
        await unregisterStoredPushDevice();
      } catch (error) {
        console.warn(
          "[push] Could not unregister this device during logout",
          error,
        );
      }
      try {
        await api.post("/auth/logout");
      } catch {
        // Local logout must still complete when the API is unavailable.
      }
      await clearTokens();
      await endKeycloakSession(idToken);
    } finally {
      try {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    }
  }, [setSessionUser]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      refreshUser,
      billingLocked,
      clearBillingLock: () => setBillingLocked(false),
    }),
    [user, isLoading, login, register, logout, refreshUser, billingLocked],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface CreditBalanceContextType {
  balance: number | null;
  /** Set the balance directly — pass credits_remaining from any AI/payment
   * response so every consumer (e.g. the Navbar pill) updates instantly
   * without waiting on a network round-trip. */
  setBalance: (balance: number | null) => void;
  /** Subtract a cost the backend has just reserved, so the pill drops the moment
   * a generation starts rather than when it finishes. Applied as a functional
   * update because several generations can start at once (one per scene card) —
   * a `setBalance(balance - cost)` built from a captured `balance` would lose all
   * but the last, which is the same lost-update bug the backend's atomic
   * spend_credits() exists to prevent. */
  reserveBalance: (cost: number) => void;
  /** Re-fetches from the backend and updates the shared balance. */
  refreshBalance: () => Promise<number | null>;
}

const CreditBalanceContext = createContext<CreditBalanceContextType | undefined>(undefined);

export const CreditBalanceProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [balance, setBalanceState] = useState<number | null>(null);

  const refreshBalance = useCallback(async (): Promise<number | null> => {
    try {
      const res = await authFetch("/users/me");
      const data = await res.json();
      setBalanceState(data.current_credit_balance);
      return data.current_credit_balance as number;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => setBalanceState(null), 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    authFetch("/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setBalanceState(data.current_credit_balance);
      })
      .catch(() => {
        if (!cancelled) setBalanceState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setBalance = useCallback((value: number | null) => setBalanceState(value), []);

  const reserveBalance = useCallback(
    (cost: number) => setBalanceState((prev) => (prev === null ? prev : prev - cost)),
    []
  );

  return (
    <CreditBalanceContext.Provider value={{ balance, setBalance, reserveBalance, refreshBalance }}>
      {children}
    </CreditBalanceContext.Provider>
  );
};

export const useCreditBalance = () => {
  const context = useContext(CreditBalanceContext);
  if (!context) {
    throw new Error("useCreditBalance must be used within a CreditBalanceProvider");
  }
  return context;
};

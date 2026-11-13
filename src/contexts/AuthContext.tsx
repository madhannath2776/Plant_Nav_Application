import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { UserProfile } from "../types";

type AuthValue = {
  user: User | null;
  /** True until the session AND the role (admin or not) are known. */
  loading: boolean;
  /** Resolved from the database (public.is_admin()), never from client state. */
  isAdmin: boolean;
  profile: UserProfile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!supabase) { setSessionLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setSessionLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Keep the same object when only the token refreshed, so effects keyed on user don't re-run.
      setUser((current) => (current?.id === session?.user?.id ? current : session?.user ?? null));
      setSessionLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = user?.id;

  // Role + profile. The role comes from the database every time the user changes.
  useEffect(() => {
    if (!supabase || !userId) { setIsAdmin(false); setProfile(null); setRoleLoading(false); return; }
    let cancelled = false;
    setRoleLoading(true);
    Promise.all([
      supabase.rpc("is_admin"),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ]).then(([role, profileResult]) => {
      if (cancelled) return;
      setIsAdmin(role.data === true);
      setProfile((profileResult.data as UserProfile | null) ?? null);
      setRoleLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Live XP / level / avatar updates (header, profile, home all read this).
  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    const channel = client.channel(`profile-${userId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
      (payload) => setProfile((current) => ({ ...(current ?? { id: userId }), ...(payload.new as UserProfile) })),
    ).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [userId]);

  const refreshProfile = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) setProfile(data as UserProfile);
  }, [userId]);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading: sessionLoading || roleLoading,
    isAdmin,
    profile,
    refreshProfile,
    signOut: async () => {
      await supabase?.auth.signOut();
      setIsAdmin(false);
      setProfile(null);
    },
  }), [user, sessionLoading, roleLoading, isAdmin, profile, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

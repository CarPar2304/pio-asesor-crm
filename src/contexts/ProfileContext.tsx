import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UserProfile {
  id: string;
  userId: string;
  name: string;
  position: string;
  phone: string;
  segment: string;
  avatarUrl: string | null;
  email?: string;
}

export interface Segment {
  id: string;
  name: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface SalesCurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
}

interface ProfileContextType {
  profile: UserProfile | null;
  allProfiles: UserProfile[];
  segments: Segment[];
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  isAdmin: boolean;
  salesCurrency: SalesCurrencyConfig;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  addSegment: (name: string) => Promise<void>;
  removeSegment: (id: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  updateSalesCurrency: (config: SalesCurrencyConfig) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [salesCurrency, setSalesCurrency] = useState<SalesCurrencyConfig>({ code: 'COP', symbol: '$', locale: 'es-CO' });

  const fetchProfiles = useCallback(async () => {
    if (!session) return;
    const [profilesRes, usersEmailMap] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('profiles').select('user_id'),
    ]);

    // Get emails from auth - we'll use the profiles + user session
    const profiles: UserProfile[] = (profilesRes.data || []).map((p: any) => ({
      id: p.id,
      userId: p.user_id,
      name: p.name || '',
      position: p.position || '',
      phone: p.phone || '',
      segment: p.segment || '',
      avatarUrl: p.avatar_url,
    }));

    setAllProfiles(profiles);
    const myProfile = profiles.find(p => p.userId === session.user.id);
    if (myProfile) {
      myProfile.email = session.user.email;
      setProfile(myProfile);
    }
  }, [session]);

  const fetchSegments = useCallback(async () => {
    if (!session) return;
    const [{ data: segData }, { data: catData }] = await Promise.all([
      supabase.from('segments').select('*').order('name'),
      supabase.from('crm_categories').select('id, name').order('name'),
    ]);
    const manualSegments = (segData || []).map((s: any) => ({ id: s.id, name: s.name }));
    const categorySegments = (catData || []).map((c: any) => ({ id: `cat-${c.id}`, name: c.name }));
    // Merge both, deduplicate by name
    const merged = [...manualSegments];
    for (const cat of categorySegments) {
      if (!merged.some(s => s.name.toLowerCase() === cat.name.toLowerCase())) {
        merged.push(cat);
      }
    }
    merged.sort((a, b) => a.name.localeCompare(b.name));
    setSegments(merged);
  }, [session]);

  const fetchNotifications = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    setNotifications((data || []).map((n: any) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      referenceId: n.reference_id,
      isRead: n.is_read,
      createdAt: n.created_at,
    })));
  }, [session]);

  const fetchAdminStatus = useCallback(async () => {
    if (!session) { setIsAdmin(false); return; }
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
    setIsAdmin((data || []).some((r: any) => r.role === 'admin'));
  }, [session]);

  const fetchSalesCurrency = useCallback(async () => {
    const { data } = await supabase.from('feature_settings').select('config').eq('feature_key', 'sales_currency').maybeSingle();
    if (data?.config && typeof data.config === 'object') {
      const cfg = data.config as any;
      setSalesCurrency({ code: cfg.code || 'COP', symbol: cfg.symbol || '$', locale: cfg.locale || 'es-CO' });
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setAllProfiles([]);
      setSegments([]);
      setNotifications([]);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    Promise.all([fetchProfiles(), fetchSegments(), fetchNotifications(), fetchAdminStatus(), fetchSalesCurrency()]).then(() => setLoading(false));
  }, [session, fetchProfiles, fetchSegments, fetchNotifications, fetchAdminStatus, fetchSalesCurrency]);

  // Real-time notifications
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => {
        fetchNotifications();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, fetchNotifications]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!session) return;
    const mapped: any = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.position !== undefined) mapped.position = updates.position;
    if (updates.phone !== undefined) mapped.phone = updates.phone;
    if (updates.segment !== undefined) mapped.segment = updates.segment;
    if (updates.avatarUrl !== undefined) mapped.avatar_url = updates.avatarUrl;
    mapped.updated_at = new Date().toISOString();

    await supabase.from('profiles').update(mapped).eq('user_id', session.user.id);
    await fetchProfiles();
  }, [session, fetchProfiles]);

  const addSegment = useCallback(async (name: string) => {
    await supabase.from('segments').insert({ name } as any);
    await fetchSegments();
  }, [fetchSegments]);

  const removeSegment = useCallback(async (id: string) => {
    await supabase.from('segments').delete().eq('id', id);
    await fetchSegments();
  }, [fetchSegments]);

  const markNotificationRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!session) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', session.user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, [session]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <ProfileContext.Provider value={{
      profile, allProfiles, segments, notifications, unreadCount, loading, isAdmin,
      updateProfile, addSegment, removeSegment,
      markNotificationRead, markAllRead,
      refreshNotifications: fetchNotifications,
      refreshProfiles: fetchProfiles,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}

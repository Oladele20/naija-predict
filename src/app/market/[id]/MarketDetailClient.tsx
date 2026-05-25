'use client';
// app/market/[id]/MarketDetailClient.tsx
// Client wrapper for TradePanel — handles real-time market price updates

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import TradePanel from '@/components/markets/TradePanel';
import type { Market, Profile } from '@/types';

interface Props {
  market: Market;
  profile: Profile | null;
}

export default function MarketDetailClient({ market: initialMarket, profile: initialProfile }: Props) {
  const [market, setMarket] = useState<Market>(initialMarket);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const supabase = createClient();

  useEffect(() => {
    // Subscribe to real-time market price changes
    const marketChannel = supabase
      .channel(`market-${market.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markets', filter: `id=eq.${market.id}` },
        (payload) => {
          setMarket(prev => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    // Subscribe to profile balance changes
    if (profile) {
      const profileChannel = supabase
        .channel(`profile-trade-${profile.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
          (payload) => {
            setProfile(prev => prev ? { ...prev, balance: payload.new.balance } : null);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(marketChannel);
        supabase.removeChannel(profileChannel);
      };
    }

    return () => { supabase.removeChannel(marketChannel); };
  }, [market.id, profile?.id]);

  const handleTradeComplete = async () => {
    // Refresh market data after trade
    const { data } = await supabase.from('markets').select('*').eq('id', market.id).single();
    if (data) setMarket(data);

    // Refresh profile balance
    if (profile) {
      const { data: updatedProfile } = await supabase
        .from('profiles').select('*').eq('id', profile.id).single();
      if (updatedProfile) setProfile(updatedProfile);
    }
  };

  return (
    <TradePanel
      market={market}
      profile={profile}
      onTradeComplete={handleTradeComplete}
    />
  );
}

'use client';
// components/layout/Navbar.tsx

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatNGN } from '@/lib/banks';
import type { Profile } from '@/types';
import {
  TrendingUp, Wallet, LogOut, User,
  Menu, X, ChevronDown, Shield,
} from 'lucide-react';

export default function Navbar() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(data);
    };
    fetchProfile();

    // Subscribe to balance changes
    const channel = supabase
      .channel('profile-balance')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        setProfile(prev => prev ? { ...prev, balance: payload.new.balance } : null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const navLinks = [
    { href: '/dashboard', label: 'Markets' },
    { href: '/deposit', label: 'Deposit' },
    { href: '/withdraw', label: 'Withdraw' },
    { href: '/profile', label: 'Portfolio' },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-[#2d2d4e] backdrop-blur-xl"
         style={{ background: 'rgba(10,10,15,0.85)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-[#00d4aa] flex items-center justify-center
                            group-hover:glow-accent transition-all">
              <TrendingUp size={16} className="text-[#0a0a0f]" />
            </div>
            <span className="font-display font-800 text-lg tracking-tight">
              Naija<span className="text-accent">Predict</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${pathname === link.href
                    ? 'bg-[#1a1a2e] text-accent'
                    : 'text-gray-400 hover:text-white hover:bg-[#1a1a2e]'
                  }`}
              >
                {link.label}
              </Link>
            ))}
            {profile?.is_admin && (
              <Link href="/admin/withdrawals"
                className="px-4 py-2 rounded-lg text-sm font-medium text-warning hover:bg-[#1a1a2e] transition-all flex items-center gap-1">
                <Shield size={14} />
                Admin
              </Link>
            )}
          </div>

          {/* Right Side */}
          <div className="hidden md:flex items-center gap-3">
            {profile ? (
              <>
                {/* Balance chip */}
                <Link href="/deposit"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg surface border
                             hover:border-accent transition-all">
                  <Wallet size={14} className="text-accent" />
                  <span className="font-display font-700 text-sm text-accent">
                    {formatNGN(profile.balance)}
                  </span>
                </Link>

                {/* Profile dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg surface border hover:border-[#3d3d6e] transition-all"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#00d4aa] flex items-center justify-center text-[10px] font-bold text-[#0a0a0f]">
                      {profile.full_name?.charAt(0).toUpperCase() ?? profile.email.charAt(0).toUpperCase()}
                    </div>
                    <ChevronDown size={12} className="text-gray-500" />
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 mt-2 w-52 surface-2 rounded-xl border shadow-xl z-50">
                      <div className="p-3 border-b border-[#2d2d4e]">
                        <p className="text-sm font-medium">{profile.full_name ?? 'User'}</p>
                        <p className="text-xs text-gray-500 truncate">{profile.email}</p>
                      </div>
                      <div className="p-1">
                        <Link href="/profile"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-[#12121f] transition-all"
                          onClick={() => setProfileOpen(false)}>
                          <User size={14} /> Portfolio
                        </Link>
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-danger hover:bg-[#12121f] transition-all">
                          <LogOut size={14} /> Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link href="/auth/login" className="btn-primary text-sm px-5 py-2">
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#2d2d4e] bg-[#0a0a0f] px-4 py-4 space-y-1">
          {navLinks.map(link => (
            <Link key={link.href} href={link.href}
              className="block px-4 py-3 rounded-lg text-sm text-gray-300 hover:bg-[#1a1a2e] transition-all"
              onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}
          {profile && (
            <div className="pt-3 border-t border-[#2d2d4e] mt-3">
              <div className="flex items-center gap-2 px-4 py-2 text-accent font-display font-700">
                <Wallet size={16} /> {formatNGN(profile.balance)}
              </div>
              <button onClick={handleSignOut}
                className="w-full text-left px-4 py-3 rounded-lg text-sm text-danger hover:bg-[#1a1a2e] transition-all">
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

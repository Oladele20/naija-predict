// app/admin/disputes/page.tsx
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import AdminDisputesClient from './AdminDisputesClient';

export default async function AdminDisputesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const adminSupabase = createAdminSupabaseClient();
  const { data: profile } = await adminSupabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) redirect('/dashboard');

  const { data: disputes } = await adminSupabase
    .from('disputes')
    .select('*, markets(id, title, description, total_pool, yes_shares, no_shares, oracle_source)')
    .order('created_at', { ascending: true });

  return (
    <div className="min-h-screen">
      <Navbar />
      <AdminDisputesClient initialDisputes={disputes ?? []} />
    </div>
  );
}

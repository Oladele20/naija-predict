// app/admin/withdrawals/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import AdminWithdrawalsClient from './AdminWithdrawalsClient';

export default async function AdminWithdrawalsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Verify admin
  const adminSupabase = createAdminSupabaseClient();
  const { data: profile } = await adminSupabase
    .from('profiles').select('is_admin').eq('id', user.id).single();

  if (!profile?.is_admin) redirect('/dashboard');

  // Fetch all pending withdrawals with user info
  const { data: withdrawals } = await adminSupabase
    .from('withdrawals')
    .select('*, profiles(email, full_name)')
    .order('created_at', { ascending: true }); // oldest first = FIFO queue

  return (
    <div className="min-h-screen">
      <Navbar />
      <AdminWithdrawalsClient initialWithdrawals={withdrawals ?? []} />
    </div>
  );
}

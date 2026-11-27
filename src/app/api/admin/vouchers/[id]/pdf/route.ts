import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { buildVoucherPdf, type Voucher } from '@/lib/vouchers';

export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { id } = await params; if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  const { data: v } = await serviceClient().from('gift_vouchers').select('id,code,label,credits,amount_cents,status,buyer_name,buyer_email,recipient_name,message,expires_at,email_sent_at').eq('id', id).single();
  if (!v || !['paid', 'redeemed'].includes(v.status)) return NextResponse.json({ error: 'Bon introuvable ou non payé' }, { status: 404 });
  const pdf = await buildVoucherPdf(v as Voucher, new URL(req.url).origin);
  return new NextResponse(Buffer.from(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="bon-cadeau-${v.code}.pdf"`, 'cache-control': 'no-store' } });
}

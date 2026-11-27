-- BON CADEAU — mention promotionnelle pilotée par la base (affichée seulement quand elle est active). Additive et rejouable.
alter table public.voucher_products add column if not exists promo_label text check (promo_label is null or char_length(promo_label) <= 30);
alter table public.voucher_products add column if not exists promo_until date;
-- Offre de Noël sur le pack de 5 cours, jusqu'au 31/12/2026 (modifiable : update public.voucher_products set promo_until = '…' where code = 'pack5';)
update public.voucher_products set promo_label = 'Offre de Noël', promo_until = '2026-12-31' where code = 'pack5' and promo_label is null;

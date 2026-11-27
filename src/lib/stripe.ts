import 'server-only';
import Stripe from 'stripe';
export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
export function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!.trim()); }

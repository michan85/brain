/**
 * Stripe Webhook Handler
 *
 * Stripe stores `user_id` in the charge/checkout metadata. This field was set
 * when the customer was first created in Stripe (via Checkout.Session.create)
 * and is echoed back in every webhook event for that customer.
 *
 * CRITICAL: We CANNOT retroactively change the metadata stored in Stripe.
 * There are ~180K Stripe customer records with `user_id` in their metadata.
 * Stripe's API does not support bulk metadata migration.
 *
 * Any rename of `user_id` internally must maintain a mapping layer at this
 * ingestion boundary — incoming webhooks will always contain `user_id`.
 */

import Stripe from "stripe";
import { db } from "../db/connection";
import { auditLog } from "../audit/logger";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function handleStripeWebhook(req: Request): Promise<Response> {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing signature", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Stripe echoes back the user_id we set during checkout creation.
      // This is the ONLY way we link Stripe events to our internal users.
      const userId = session.metadata?.user_id;
      if (!userId) {
        console.error("checkout.session.completed missing user_id in metadata", {
          sessionId: session.id,
        });
        return new Response("Missing user_id in metadata", { status: 400 });
      }

      // Create order from the completed checkout
      const order = db.query(
        `INSERT INTO orders (user_id, total_cents, currency, status, stripe_charge_id)
         VALUES ($1, $2, $3, 'completed', $4)
         RETURNING order_id`,
        [userId, session.amount_total, session.currency?.toUpperCase() ?? "USD", session.payment_intent]
      );

      await auditLog({
        user_id: userId,
        action: "order.created",
        resource_type: "order",
        resource_id: order.order_id,
        metadata: { stripe_session_id: session.id, amount: session.amount_total },
      });

      console.log(`Order created for user_id=${userId}: ${order.order_id}`);
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;

      // user_id is stored in the charge metadata, set during the original checkout
      const userId = charge.metadata?.user_id;
      if (!userId) {
        console.error("charge.refunded missing user_id in metadata", { chargeId: charge.id });
        return new Response("OK", { status: 200 }); // Don't fail on missing metadata
      }

      // Find and update the associated order
      const order = db.query(
        `UPDATE orders SET status = 'refunded', updated_at = now()
         WHERE stripe_charge_id = $1 AND user_id = $2
         RETURNING order_id`,
        [charge.id, userId]
      );

      if (order) {
        await auditLog({
          user_id: userId,
          action: "order.refunded",
          resource_type: "order",
          resource_id: order.order_id,
          metadata: { stripe_charge_id: charge.id, refund_amount: charge.amount_refunded },
        });
      }

      console.log(`Refund processed for user_id=${userId}: charge ${charge.id}`);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      // user_id stored in subscription metadata
      const userId = subscription.metadata?.user_id;
      if (!userId) {
        console.error("subscription.updated missing user_id in metadata");
        return new Response("OK", { status: 200 });
      }

      await auditLog({
        user_id: userId,
        action: "subscription.updated",
        resource_type: "subscription",
        resource_id: subscription.id,
        metadata: { status: subscription.status, plan: subscription.items.data[0]?.price?.id },
      });

      console.log(`Subscription updated for user_id=${userId}: ${subscription.id} -> ${subscription.status}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return new Response("OK", { status: 200 });
}

/**
 * Called during checkout to set user_id in Stripe metadata.
 * This is the point where user_id gets "locked in" to Stripe's records.
 * Once set, it cannot be bulk-updated across existing Stripe objects.
 */
export async function createCheckoutSession(userId: string, priceId: string): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      user_id: userId,  // This gets echoed back in all future webhook events
      platform: "acme",
      checkout_version: "2",
    },
    success_url: `${process.env.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/checkout/cancel`,
  });

  return session.url!;
}

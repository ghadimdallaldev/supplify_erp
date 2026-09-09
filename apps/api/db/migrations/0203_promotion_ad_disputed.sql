-- Allow disputed payment_status for promotion ads (Stripe chargebacks).

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_payment_status_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_payment_status_check
  CHECK (payment_status IN (
    'not_required', 'pending', 'paid', 'failed', 'refunded', 'cancelled', 'disputed'
  ));

ALTER TABLE supplier_featured_placements
  DROP CONSTRAINT IF EXISTS supplier_featured_placements_payment_status_check;

ALTER TABLE supplier_featured_placements
  ADD CONSTRAINT supplier_featured_placements_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'waived', 'failed', 'refunded', 'disputed'));

ALTER TABLE billing_payment DROP CONSTRAINT IF EXISTS billing_payment_status_check;
ALTER TABLE billing_payment ADD CONSTRAINT billing_payment_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED', 'DISPUTED'));

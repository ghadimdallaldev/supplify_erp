-- Check current order_status enum values
SELECT unnest(enum_range(NULL::order_status)) as enum_value;


# Store-wide deal badges

Restaurants see **On sale** badges on the supplier list when a supplier has an active **store-wide** deal (`applies_to = all`) — a percentage or fixed discount promotion that is currently live.

## API enrichment

`GET /api/suppliers` adds per supplier (batch query, no N+1):

| Field              | Type           | Description                                    |
| ------------------ | -------------- | ---------------------------------------------- |
| `has_store_deal`   | boolean        | Active store-wide percentage/fixed deal exists |
| `store_deal_label` | string \| null | e.g. `15% off`, `$25.00 off`                   |
| `store_deal_id`    | uuid \| null   | Best matching promotion id                     |

When the caller is a restaurant, deals respect `promotion_restaurant_targets` the same way as checkout promotion loading.

## Web UI

- **Suppliers page:** badge on supplier cards, **On sale now** filter, **Best deals** sort.
- **Promotions page:** quick **store-wide** presets in the create-deal dialog (sets `applies_to = all`).

## Mobile parity

<!-- TODO: align supplify-mobile supplier list types and badges when mobile supplier discovery ships -->

## See also

- [deals-and-promotions.md](./deals-and-promotions.md)

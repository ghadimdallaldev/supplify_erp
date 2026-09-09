-- Guest menu: allergen and dietary tags on menu items

ALTER TABLE menu_item
  ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_menu_item_allergens ON menu_item USING GIN (allergens);
CREATE INDEX IF NOT EXISTS idx_menu_item_dietary_tags ON menu_item USING GIN (dietary_tags);

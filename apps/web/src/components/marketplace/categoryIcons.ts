import type { Icon } from '@phosphor-icons/react/dist/lib/types'
// Per-icon entry points: the package barrel pulls in ~1,500 modules (slow tests, EMFILE).
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { Bag } from '@phosphor-icons/react/dist/csr/Bag'
import { Basket } from '@phosphor-icons/react/dist/csr/Basket'
import { Bone } from '@phosphor-icons/react/dist/csr/Bone'
import { BowlFood } from '@phosphor-icons/react/dist/csr/BowlFood'
import { BowlSteam } from '@phosphor-icons/react/dist/csr/BowlSteam'
import { Bread } from '@phosphor-icons/react/dist/csr/Bread'
import { Bug } from '@phosphor-icons/react/dist/csr/Bug'
import { Cake } from '@phosphor-icons/react/dist/csr/Cake'
import { Carrot } from '@phosphor-icons/react/dist/csr/Carrot'
import { Cheese } from '@phosphor-icons/react/dist/csr/Cheese'
import { ChefHat } from '@phosphor-icons/react/dist/csr/ChefHat'
import { Cherries } from '@phosphor-icons/react/dist/csr/Cherries'
import { Coffee } from '@phosphor-icons/react/dist/csr/Coffee'
import { CoffeeBean } from '@phosphor-icons/react/dist/csr/CoffeeBean'
import { Cookie } from '@phosphor-icons/react/dist/csr/Cookie'
import { CookingPot } from '@phosphor-icons/react/dist/csr/CookingPot'
import { Cow } from '@phosphor-icons/react/dist/csr/Cow'
import { Cube } from '@phosphor-icons/react/dist/csr/Cube'
import { DotsThree } from '@phosphor-icons/react/dist/csr/DotsThree'
import { Drop } from '@phosphor-icons/react/dist/csr/Drop'
import { DropHalf } from '@phosphor-icons/react/dist/csr/DropHalf'
import { Egg } from '@phosphor-icons/react/dist/csr/Egg'
import { Fire } from '@phosphor-icons/react/dist/csr/Fire'
import { Fish } from '@phosphor-icons/react/dist/csr/Fish'
import { FishSimple } from '@phosphor-icons/react/dist/csr/FishSimple'
import { Flask } from '@phosphor-icons/react/dist/csr/Flask'
import { ForkKnife } from '@phosphor-icons/react/dist/csr/ForkKnife'
import { Grains } from '@phosphor-icons/react/dist/csr/Grains'
import { Hamburger } from '@phosphor-icons/react/dist/csr/Hamburger'
import { Hand } from '@phosphor-icons/react/dist/csr/Hand'
import { HandSoap } from '@phosphor-icons/react/dist/csr/HandSoap'
import { IceCream } from '@phosphor-icons/react/dist/csr/IceCream'
import { Jar } from '@phosphor-icons/react/dist/csr/Jar'
import { Knife } from '@phosphor-icons/react/dist/csr/Knife'
import { Leaf } from '@phosphor-icons/react/dist/csr/Leaf'
import { Martini } from '@phosphor-icons/react/dist/csr/Martini'
import { Nut } from '@phosphor-icons/react/dist/csr/Nut'
import { OrangeSlice } from '@phosphor-icons/react/dist/csr/OrangeSlice'
import { Oven } from '@phosphor-icons/react/dist/csr/Oven'
import { Package } from '@phosphor-icons/react/dist/csr/Package'
import { Pepper } from '@phosphor-icons/react/dist/csr/Pepper'
import { Plant } from '@phosphor-icons/react/dist/csr/Plant'
import { Popcorn } from '@phosphor-icons/react/dist/csr/Popcorn'
import { Scroll } from '@phosphor-icons/react/dist/csr/Scroll'
import { Shrimp } from '@phosphor-icons/react/dist/csr/Shrimp'
import { Snowflake } from '@phosphor-icons/react/dist/csr/Snowflake'
import { SprayBottle } from '@phosphor-icons/react/dist/csr/SprayBottle'
import { TShirt } from '@phosphor-icons/react/dist/csr/TShirt'
import { ToiletPaper } from '@phosphor-icons/react/dist/csr/ToiletPaper'
import { Towel } from '@phosphor-icons/react/dist/csr/Towel'
import { Wine } from '@phosphor-icons/react/dist/csr/Wine'

/**
 * `product_category.icon_key` (a kebab-case Phosphor name) → icon component. Same vocabulary
 * as mobile (spec §11.6). Keep in sync with the seeded tree; unknown keys use the fallback.
 */
export const CATEGORY_ICONS: Record<string, Icon> = {
  archive: Archive,
  bag: Bag,
  basket: Basket,
  bone: Bone,
  'bowl-food': BowlFood,
  'bowl-steam': BowlSteam,
  bread: Bread,
  bug: Bug,
  cake: Cake,
  carrot: Carrot,
  cheese: Cheese,
  'chef-hat': ChefHat,
  cherries: Cherries,
  coffee: Coffee,
  'coffee-bean': CoffeeBean,
  cookie: Cookie,
  'cooking-pot': CookingPot,
  cow: Cow,
  cube: Cube,
  'dots-three': DotsThree,
  drop: Drop,
  'drop-half': DropHalf,
  egg: Egg,
  fire: Fire,
  fish: Fish,
  'fish-simple': FishSimple,
  flask: Flask,
  'fork-knife': ForkKnife,
  grains: Grains,
  hamburger: Hamburger,
  hand: Hand,
  'hand-soap': HandSoap,
  'ice-cream': IceCream,
  jar: Jar,
  knife: Knife,
  leaf: Leaf,
  martini: Martini,
  nut: Nut,
  'orange-slice': OrangeSlice,
  oven: Oven,
  package: Package,
  pepper: Pepper,
  plant: Plant,
  popcorn: Popcorn,
  scroll: Scroll,
  shrimp: Shrimp,
  snowflake: Snowflake,
  'spray-bottle': SprayBottle,
  't-shirt': TShirt,
  'toilet-paper': ToiletPaper,
  towel: Towel,
  wine: Wine,
}

export const FALLBACK_CATEGORY_ICON: Icon = Basket

export function categoryIcon(iconKey: string | null | undefined): Icon {
  return (iconKey && CATEGORY_ICONS[iconKey]) || FALLBACK_CATEGORY_ICON
}

/**
 * Soft tint per department icon, so the tile grid reads as distinct aisles. Tokens only (dark
 * mode follows the theme); the hue cycles by a stable hash of the key.
 */
const TINTS = [
  'bg-[var(--brand-pale)] text-[var(--brand-mid)]',
  'bg-[var(--amber-pale)] text-[var(--amber)]',
  'bg-[var(--red-pale)] text-[var(--red)]',
  'bg-[var(--brand-ultra)] text-[var(--text-mid)]',
]

export function categoryTint(key: string | null | undefined): string {
  const text = key || ''
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0
  return TINTS[Math.abs(hash) % TINTS.length]
}

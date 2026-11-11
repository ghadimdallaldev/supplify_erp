// Synthetic, fictitious Lebanese businesses and sample prices. No Supplify API is ever called.
export const LIFECYCLE = [
  'Placed',
  'Acknowledged',
  'Processing',
  'Shipped',
  'Delivered',
  'Received',
  'Invoiced',
] as const
export type Status = (typeof LIFECYCLE)[number]

export type Product = {
  id: string
  name: string
  unit: string
  price: number
  stock: number
  suggest: number
}
export type SupplierFixture = {
  id: string
  name: string
  kind: string
  city: string
  products: Product[]
}

export const SUPPLIERS: SupplierFixture[] = [
  {
    id: 'cedar',
    name: 'Cedar Fresh Produce',
    kind: 'Fruit, vegetables and herbs',
    city: 'Beirut',
    products: [
      { id: 'tomatoes', name: 'Baladi Tomatoes', unit: 'kg', price: 1.2, stock: 120, suggest: 20 },
      {
        id: 'cucumbers',
        name: 'Baladi Cucumbers',
        unit: 'kg',
        price: 1.4,
        stock: 501,
        suggest: 15,
      },
      { id: 'lemons', name: 'Lebanese Lemons', unit: 'kg', price: 1.6, stock: 214, suggest: 10 },
      { id: 'mint', name: 'Fresh Mint', unit: 'bunch', price: 0.6, stock: 134, suggest: 12 },
    ],
  },
  {
    id: 'bekaa',
    name: 'Bekaa Valley Dairy Co.',
    kind: 'Dairy and cheese',
    city: 'Zahle',
    products: [
      { id: 'labneh', name: 'Labneh', unit: 'kg', price: 6.8, stock: 88, suggest: 8 },
      { id: 'akkawi', name: 'Akkawi Cheese', unit: 'kg', price: 9.5, stock: 64, suggest: 6 },
      { id: 'yogurt', name: 'Fresh Yogurt', unit: 'kg', price: 2.4, stock: 210, suggest: 12 },
      { id: 'cream', name: 'Cooking Cream', unit: 'L', price: 3.2, stock: 95, suggest: 6 },
    ],
  },
  {
    id: 'tyre',
    name: 'Tyre Coast Seafood',
    kind: 'Fish and shellfish',
    city: 'Tyre',
    products: [
      { id: 'bream', name: 'Sea Bream', unit: 'kg', price: 14, stock: 40, suggest: 5 },
      { id: 'calamari', name: 'Calamari', unit: 'kg', price: 11.5, stock: 32, suggest: 4 },
      { id: 'prawns', name: 'Prawns', unit: 'kg', price: 18, stock: 25, suggest: 3 },
      { id: 'bass', name: 'Sea Bass', unit: 'kg', price: 15.5, stock: 28, suggest: 4 },
    ],
  },
  {
    id: 'jabal',
    name: 'Al Jabal Dry Goods',
    kind: 'Grains, oils and spices',
    city: 'Beirut',
    products: [
      { id: 'oil', name: 'Olive Oil (5 L)', unit: 'tin', price: 38, stock: 60, suggest: 2 },
      { id: 'bulgur', name: 'Coarse Bulgur', unit: 'kg', price: 2.1, stock: 300, suggest: 10 },
      { id: 'zaatar', name: "Za'atar Mix", unit: 'kg', price: 12, stock: 45, suggest: 2 },
      { id: 'chickpeas', name: 'Chickpeas', unit: 'kg', price: 1.9, stock: 260, suggest: 10 },
    ],
  },
]

export const money = (n: number) => `$${n.toFixed(2)}`

// Supplier-side fixture: Cedar Fresh Produce receives an order from Riviera Beirut Hotel.
export type SupplyLine = {
  id: string
  name: string
  unit: string
  qty: number
  onHand: number
  price: number
}
export const INCOMING_ORDER = {
  id: '#CF-1187',
  customer: 'Riviera Beirut Hotel',
  lines: [
    { id: 'tomatoes', name: 'Baladi Tomatoes', unit: 'kg', qty: 40, onHand: 120, price: 1.2 },
    { id: 'cucumbers', name: 'Baladi Cucumbers', unit: 'kg', qty: 30, onHand: 501, price: 1.4 },
    { id: 'lemons', name: 'Lebanese Lemons', unit: 'kg', qty: 20, onHand: 18, price: 1.6 },
    { id: 'mint', name: 'Fresh Mint', unit: 'bunch', qty: 12, onHand: 134, price: 0.6 },
  ] as SupplyLine[],
}

export const DRIVERS = [
  { id: 'fadi', name: 'Fadi R.', note: 'Beirut and Metn' },
  { id: 'tony', name: 'Tony A.', note: 'Mount Lebanon' },
]

export const CUSTOMERS = [
  {
    id: 'riviera',
    name: 'Riviera Beirut Hotel',
    kind: 'Hotel',
    last: 'Today',
    rhythm: 'Orders most weekdays',
    due: false,
  },
  {
    id: 'hamra',
    name: 'Hamra Bistro',
    kind: 'Restaurant',
    last: 'Yesterday',
    rhythm: 'Orders Monday and Thursday',
    due: false,
  },
  {
    id: 'byblos',
    name: 'Byblos Fish House',
    kind: 'Restaurant',
    last: '5 weeks ago',
    rhythm: 'Used to order every week',
    due: true,
  },
  {
    id: 'gemmayze',
    name: 'Gemmayze Kitchen',
    kind: 'Restaurant',
    last: '4 weeks ago',
    rhythm: 'Used to order every week',
    due: true,
  },
]

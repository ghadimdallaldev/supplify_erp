/**
 * Static data for seed-horeca-demo.mjs: fictional Lebanese HORECA suppliers, catalogs,
 * restaurants and people. No real company or restaurant names are used.
 *
 * Catalog line format: "English name | Arabic name | unit | price USD | imageKey [| brand]"
 */

export const DEMO_PASSWORD = 'Supplify1!'

const parse = (text) =>
  text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, ar, unit, price, img, brand] = l.split('|').map((s) => s.trim())
      return { name, ar, unit, price: Number(price), img, brand: brand || null }
    })

export const SUPPLIERS = [
  {
    key: 'cedar',
    name: 'Cedar Fresh Produce',
    slug: 'cedar-fresh-produce',
    plan: 'platinum',
    city: 'Beirut',
    area: 'Karantina',
    lat: 33.9068,
    lng: 35.5265,
    phone: '+961 1 575 100',
    logoImg: 'produce_market',
    coverImg: 'produce_market',
    paymentTerms: 'Net 15',
    minOrder: 40,
    skuPrefix: 'CFP',
    owner: { first: 'Karim', last: 'Saab', email: 'karim.saab@cedarfresh.demo' },
    team: [
      { first: 'Maya', last: 'Nassar', email: 'maya.nassar@cedarfresh.demo', role: 'Supplier Manager' },
      { first: 'Omar', last: 'Khalil', email: 'omar.khalil@cedarfresh.demo', role: 'Warehouse Manager' },
      { first: 'Layla', last: 'Haddad', email: 'layla.haddad@cedarfresh.demo', role: 'Order Fulfillment Staff' },
      { first: 'Hiba', last: 'Daher', email: 'hiba.daher@cedarfresh.demo', role: 'Accountant' },
      { first: 'Nadine', last: 'Fares', email: 'nadine.fares@cedarfresh.demo', role: 'Promotions Manager' },
      { first: 'Jad', last: 'Salameh', email: 'jad.salameh@cedarfresh.demo', role: 'Catalog Manager' },
      { first: 'Tarek', last: 'Mansour', email: 'tarek.mansour@cedarfresh.demo', role: 'Driver', driver: true, vehicle: 'Refrigerated van', plate: 'B 482913' },
      { first: 'Fadi', last: 'Rizk', email: 'fadi.rizk@cedarfresh.demo', role: 'Driver', driver: true, vehicle: 'Pickup truck', plate: 'B 317745' },
    ],
    warehouses: [
      { name: 'Beirut Central Market Hub', code: 'BEY', type: 'cold_storage', main: true, share: 0.65 },
      { name: 'Bekaa Cold Storage (Zahle)', code: 'ZAH', type: 'cold_storage', main: false, share: 0.35 },
    ],
    categories: {
      Vegetables: parse(`
Baladi Tomatoes (kg) | بندورة بلدية | kg | 1.60 | tomatoes
Cherry Tomatoes (kg) | بندورة كرزية | kg | 3.20 | tomatoes
Baladi Cucumbers (kg) | خيار بلدي | kg | 1.30 | cucumbers
Lebanese Zucchini - Kousa (kg) | كوسا لبناني | kg | 1.80 | zucchini
Baladi Eggplant (kg) | باذنجان بلدي | kg | 1.50 | eggplant
Potatoes Washed (kg) | بطاطا مغسولة | kg | 0.95 | potatoes
Red Onions (kg) | بصل أحمر | kg | 0.80 | onions
Yellow Onions 25kg Sack | بصل أصفر كيس 25 كلغ | sack | 18.00 | onions
Garlic Fresh (kg) | ثوم طازج | kg | 4.50 | garlic
Carrots (kg) | جزر | kg | 1.00 | produce_market
Green Bell Peppers (kg) | فليفلة خضراء | kg | 2.20 | peppers
Red Bell Peppers (kg) | فليفلة حمراء | kg | 3.40 | peppers
Hot Green Peppers (kg) | فلفل حار أخضر | kg | 2.80 | peppers
Cauliflower (kg) | قرنبيط | kg | 1.40 | produce_market
White Cabbage (kg) | ملفوف أبيض | kg | 0.90 | produce_market
Beetroot (kg) | شمندر | kg | 1.20 | produce_market
Fresh Okra (kg) | بامية طازجة | kg | 5.50 | produce_market
Green Beans (kg) | لوبياء خضراء | kg | 3.60 | produce_market
White Mushrooms 500g | فطر أبيض 500 غ | pack | 3.20 | produce_market
Spring Onions (bunch) | بصل أخضر ضمة | bunch | 0.50 | onions
Radish (bunch) | فجل ضمة | bunch | 0.60 | produce_market
`),
      Fruits: parse(`
Lebanese Lemons (kg) | ليمون لبناني | kg | 1.90 | lemons
Valencia Oranges (kg) | برتقال فالنسيا | kg | 1.40 | oranges
Red Apples (kg) | تفاح أحمر | kg | 1.80 | apples
Bananas (kg) | موز | kg | 1.70 | bananas
Strawberries 500g | فريز 500 غ | pack | 3.50 | strawberries
Pomegranates (kg) | رمان | kg | 3.00 | pomegranate
Watermelon (kg) | بطيخ أحمر | kg | 0.70 | produce_market
White Grapes (kg) | عنب أبيض | kg | 3.20 | produce_market
Fresh Figs 500g | تين طازج 500 غ | pack | 4.80 | produce_market
Cherries (kg) | كرز | kg | 9.00 | strawberries
Avocado (kg) | أفوكادو | kg | 5.50 | produce_market
Mango (kg) | مانغا | kg | 4.20 | produce_market
Grapefruit (kg) | غريب فروت | kg | 1.60 | oranges
Peaches (kg) | خوخ | kg | 2.80 | produce_market
Kiwi (kg) | كيوي | kg | 4.00 | produce_market
`),
      'Herbs & Leafy Greens': parse(`
Fresh Parsley (bunch) | بقدونس ضمة | bunch | 0.55 | parsley_herbs
Fresh Mint (bunch) | نعناع ضمة | bunch | 0.50 | mint
Fresh Coriander (bunch) | كزبرة ضمة | bunch | 0.55 | parsley_herbs
Fresh Dill (bunch) | شبت ضمة | bunch | 0.60 | parsley_herbs
Fresh Basil (bunch) | ريحان ضمة | bunch | 0.90 | parsley_herbs
Fresh Thyme 100g | زعتر أخضر 100 غ | pack | 1.10 | parsley_herbs
Rocket - Arugula (bunch) | جرجير ضمة | bunch | 0.70 | lettuce
Romaine Lettuce (head) | خس رومين | each | 0.90 | lettuce
Iceberg Lettuce (head) | خس ايسبرغ | each | 1.10 | lettuce
Spinach (kg) | سبانخ | kg | 2.40 | lettuce
Swiss Chard (bunch) | سلق ضمة | bunch | 0.80 | lettuce
Purslane - Baqleh (bunch) | بقلة ضمة | bunch | 0.80 | parsley_herbs
Jew's Mallow - Molokhia 500g | ملوخية 500 غ | pack | 2.20 | parsley_herbs
`),
      'Roots, Squash & Specialty': parse(`
Sweet Potatoes (kg) | بطاطا حلوة | kg | 1.90 | potatoes
Leeks (kg) | كراث | kg | 2.10 | onions
Celery (bunch) | كرفس ضمة | bunch | 0.90 | lettuce
Fennel Bulb (kg) | شمر | kg | 2.60 | produce_market
Turnips (kg) | لفت | kg | 1.10 | produce_market
Pumpkin (kg) | يقطين | kg | 1.00 | produce_market
Broccoli (kg) | بروكلي | kg | 2.80 | produce_market
Corn on the Cob (each) | ذرة على الكوز | each | 0.45 | produce_market
Peeled Garlic 1kg | ثوم مقشر 1 كلغ | pack | 6.50 | garlic
Fresh Ginger (kg) | زنجبيل طازج | kg | 4.80 | garlic
Tangerines (kg) | يوسفي | kg | 1.60 | oranges
Pears (kg) | إجاص | kg | 2.40 | apples
Fresh Dates 500g | تمر طازج 500 غ | pack | 4.20 | dates_dried_fruit
Pickling Cucumbers (kg) | خيار مخلل | kg | 2.00 | cucumbers
Cooking Tomatoes Crate 6kg | بندورة للطبخ صندوق 6 كلغ | crate | 7.50 | tomatoes
Lemon Crate 10kg | ليمون صندوق 10 كلغ | crate | 16.00 | lemons
`),
    },
  },
  {
    key: 'bekaa',
    name: 'Bekaa Valley Dairy Co.',
    slug: 'bekaa-valley-dairy-co',
    plan: 'gold',
    city: 'Zahle',
    area: 'Bekaa Industrial Zone',
    lat: 33.8463,
    lng: 35.902,
    phone: '+961 8 801 220',
    logoImg: 'dairy_farm',
    coverImg: 'dairy_farm',
    paymentTerms: 'Net 30',
    minOrder: 60,
    skuPrefix: 'BVD',
    owner: { first: 'Rola', last: 'Geagea', email: 'rola.geagea@bekaadairy.demo' },
    team: [
      { first: 'Charbel', last: 'Moussa', email: 'charbel.moussa@bekaadairy.demo', role: 'Supplier Manager' },
      { first: 'Zeina', last: 'Tannous', email: 'zeina.tannous@bekaadairy.demo', role: 'Accountant' },
      { first: 'Georges', last: 'Abi Nader', email: 'georges.abinader@bekaadairy.demo', role: 'Driver', driver: true, vehicle: 'Refrigerated van', plate: 'B 551209' },
    ],
    warehouses: [{ name: 'Zahle Dairy Plant', code: 'ZDP', type: 'cold_storage', main: true, share: 1 }],
    categories: {
      'Cheese': parse(`
Halloumi 250g | حلوم 250 غ | pack | 3.20 | halloumi_cheese
Halloumi 1kg | حلوم 1 كلغ | pack | 11.50 | halloumi_cheese
Akkawi Cheese (kg) | جبنة عكاوي | kg | 9.80 | white_cheese
Baladi White Cheese (kg) | جبنة بيضاء بلدية | kg | 8.40 | white_cheese
Shanklish 500g | شنكليش 500 غ | pack | 6.50 | white_cheese
Feta Style Cheese 900g | جبنة فيتا 900 غ | tub | 6.90 | white_cheese
Mozzarella Block 2kg | موزاريلا قالب 2 كلغ | pack | 15.00 | white_cheese
Mozzarella Shredded 2.5kg | موزاريلا مبشورة 2.5 كلغ | pack | 18.00 | white_cheese
Cheddar Slices 1kg | شرائح شيدر 1 كلغ | pack | 9.50 | white_cheese
Cream Cheese 1.5kg | جبنة كريمية 1.5 كلغ | tub | 12.00 | white_cheese
Kashkaval Cheese (kg) | جبنة قشقوان | kg | 11.80 | white_cheese
Jibneh Arisheh 400g | جبنة عريشة 400 غ | tub | 3.40 | white_cheese
Parmesan Wedge 1kg | بارميزان 1 كلغ | pack | 22.00 | white_cheese
Ashta Cream 500g | قشطة 500 غ | tub | 4.80 | cream
`),
      'Yogurt & Labneh': parse(`
Labneh 1kg tub | لبنة 1 كلغ | tub | 5.80 | labneh_yogurt
Labneh 5kg Catering Tub | لبنة 5 كلغ | tub | 26.00 | labneh_yogurt
Labneh Balls in Olive Oil 1kg | كرات لبنة بالزيت 1 كلغ | jar | 8.50 | labneh_yogurt
Full-fat Yogurt 1kg | لبن زبادي 1 كلغ | tub | 2.40 | labneh_yogurt
Full-fat Yogurt 5kg Bucket | لبن زبادي 5 كلغ | bucket | 9.50 | labneh_yogurt
Laban Ayran 1L | لبن عيران 1 ليتر | bottle | 1.60 | labneh_yogurt
Kishk Powder 1kg | كشك 1 كلغ | pack | 8.50 | labneh_yogurt
Greek Style Yogurt 1kg | لبن يوناني 1 كلغ | tub | 3.60 | labneh_yogurt
`),
      'Milk, Cream & Butter': parse(`
Fresh Full-fat Milk 1L | حليب طازج 1 ليتر | bottle | 1.50 | milk
Fresh Milk Case 12x1L | حليب طازج 12x1 ليتر | case | 17.00 | milk
UHT Milk Case 12x1L | حليب طويل الأمد 12x1 ليتر | case | 15.00 | milk
Cooking Cream 1L | كريما للطبخ 1 ليتر | pack | 3.90 | cream
Whipping Cream 1L | كريما للتحلية 1 ليتر | pack | 5.60 | cream
Sour Cream 1kg | قشدة حامضة 1 كلغ | tub | 5.40 | cream
Unsalted Butter 500g | زبدة غير مملحة 500 غ | pack | 6.80 | butter
Baladi Ghee 800g | سمنة بلدية 800 غ | jar | 9.50 | butter
`),
      Eggs: parse(`
Large Eggs Tray (30) | بيض كبير طبق 30 | tray | 5.90 | eggs
Large Eggs Carton (12 trays) | بيض كرتونة 12 طبق | carton | 66.00 | eggs
Free-range Eggs Tray (30) | بيض بلدي طبق 30 | tray | 8.60 | eggs
Liquid Egg Whole 1L | بيض سائل 1 ليتر | bottle | 4.20 | eggs
`),
    },
  },
  {
    key: 'phoenicia',
    name: 'Phoenicia Seafood Traders',
    slug: 'phoenicia-seafood-traders',
    plan: 'platinum',
    city: 'Beirut',
    area: 'Port of Beirut',
    lat: 33.9017,
    lng: 35.5199,
    phone: '+961 1 580 310',
    logoImg: 'seafood_platter',
    coverImg: 'seafood_platter',
    paymentTerms: 'Net 7',
    minOrder: 80,
    skuPrefix: 'PST',
    owner: { first: 'Elie', last: 'Barakat', email: 'elie.barakat@phoeniciaseafood.demo' },
    team: [
      { first: 'Sandra', last: 'Aoun', email: 'sandra.aoun@phoeniciaseafood.demo', role: 'Accountant' },
      { first: 'Mazen', last: 'Zogheib', email: 'mazen.zogheib@phoeniciaseafood.demo', role: 'Driver', driver: true, vehicle: 'Refrigerated truck', plate: 'B 229814' },
    ],
    warehouses: [{ name: 'Port Cold Chain Facility', code: 'PCC', type: 'cold_storage', main: true, share: 1 }],
    categories: {
      'Fresh Fish': parse(`
Fresh Sultan Ibrahim - Red Mullet (kg) | سلطان إبراهيم | kg | 14.00 | fish_fresh
Sea Bass - Lawkaz Farmed (kg) | لوقز مزارع | kg | 13.50 | sea_bass
Sea Bream - Orata (kg) | أوراطا | kg | 13.00 | sea_bass
Wild Grouper - Sheiry (kg) | شعري | kg | 22.00 | fish_fresh
Fresh Sardines (kg) | سردين طازج | kg | 6.50 | fish_fresh
Swordfish Steaks (kg) | شرائح سمك أبو سيف | kg | 18.00 | fish_fresh
Salmon Fillet Norwegian (kg) | فيليه سلمون | kg | 24.00 | fish_fresh
Tuna Loin (kg) | تونة لوين | kg | 26.00 | fish_fresh
Whole Trout (kg) | سمك سلمون مرقط | kg | 9.50 | fish_fresh
Fresh Anchovies (kg) | أنشوجة طازجة | kg | 7.50 | fish_fresh
`),
      'Shellfish & Squid': parse(`
Calamari Cleaned (kg) | حبار منظف | kg | 12.00 | squid
Large Shrimp 21/25 (kg) | قريدس كبير | kg | 19.00 | shrimp
Medium Shrimp 31/40 1kg | قريدس وسط 1 كلغ | pack | 14.50 | shrimp
Octopus (kg) | أخطبوط | kg | 16.00 | squid
Mussels 1kg | بلح البحر 1 كلغ | pack | 7.00 | shrimp
Clams 1kg | محار صغير 1 كلغ | pack | 11.00 | shrimp
Crab Meat 500g | لحم سلطعون 500 غ | pack | 17.00 | shrimp
Frozen Lobster Tail (each) | ذيل كركند | each | 28.00 | shrimp
`),
      'Frozen & Smoked': parse(`
Smoked Salmon Sliced 1kg | سلمون مدخن 1 كلغ | pack | 38.00 | fish_fresh
Frozen Cod Fillet 1kg | فيليه قد مجمد 1 كلغ | pack | 15.00 | fish_fresh
Frozen Hamour Fillet 1kg | فيليه هامور مجمد 1 كلغ | pack | 17.50 | fish_fresh
Frozen Breaded Calamari Rings 1kg | حلقات حبار مقرمشة 1 كلغ | pack | 9.80 | squid
Salted Anchovies 1kg | أنشوجة مملحة 1 كلغ | pack | 9.00 | fish_fresh
Fish Stock Concentrate 1kg | مرقة سمك 1 كلغ | pack | 6.50 | fish_fresh
Ice Flakes 10kg Bag | ثلج مجروش 10 كلغ | bag | 2.50 | fish_fresh
`),
    },
  },
  {
    key: 'meats',
    name: 'Mount Lebanon Meats',
    slug: 'mount-lebanon-meats',
    plan: 'gold',
    city: 'Beirut',
    area: 'Sin el Fil',
    lat: 33.8806,
    lng: 35.5391,
    phone: '+961 1 490 755',
    logoImg: 'butcher_shop',
    coverImg: 'butcher_shop',
    paymentTerms: 'Net 15',
    minOrder: 100,
    skuPrefix: 'MLM',
    owner: { first: 'Antoine', last: 'Chidiac', email: 'antoine.chidiac@mountlebanonmeats.demo' },
    team: [
      { first: 'Rima', last: 'Hobeika', email: 'rima.hobeika@mountlebanonmeats.demo', role: 'Accountant' },
      { first: 'Walid', last: 'Bou Khalil', email: 'walid.boukhalil@mountlebanonmeats.demo', role: 'Driver', driver: true, vehicle: 'Refrigerated van', plate: 'B 663021' },
    ],
    warehouses: [{ name: 'Sin el Fil Cold Room', code: 'SEF', type: 'cold_storage', main: true, share: 1 }],
    categories: {
      'Lamb & Veal': parse(`
Lamb Leg Bone-in (kg) | فخذ غنم بالعظم | kg | 14.50 | lamb_meat
Lamb Shoulder (kg) | كتف غنم | kg | 12.50 | lamb_meat
Lamb Chops - Kastaleta (kg) | كستليتا غنم | kg | 19.50 | lamb_meat
Lamb Ribs (kg) | ضلوع غنم | kg | 11.50 | lamb_meat
Minced Lamb (kg) | لحم غنم مفروم | kg | 13.00 | minced_meat
Lamb Liver (kg) | كبدة غنم | kg | 9.50 | lamb_meat
Veal Escalope (kg) | إسكالوب عجل | kg | 16.00 | beef_steak
Kibbeh Raw Mix (kg) | كبة نية جاهزة | kg | 12.50 | minced_meat
`),
      Beef: parse(`
Beef Minced 80/20 (kg) | لحم بقر مفروم | kg | 9.80 | minced_meat
Beef Tenderloin (kg) | فيليه بقر | kg | 26.00 | beef_steak
Beef Ribeye (kg) | ريب آي | kg | 22.00 | beef_steak
Beef Striploin (kg) | ستريبلوين | kg | 19.50 | beef_steak
Beef Cubes for Stew (kg) | مكعبات لحم بقر | kg | 10.50 | beef_steak
Beef Shawarma Marinated (kg) | شاورما لحم متبلة | kg | 11.50 | shawarma
Beef Burger Patties 150g (20pcs) | برغر لحم 150 غ (20 قطعة) | box | 28.00 | burger
Kafta Mix (kg) | كفتة جاهزة | kg | 11.80 | grilled_meat_skewers
`),
      Poultry: parse(`
Chicken Breast Fillet (kg) | صدر دجاج فيليه | kg | 5.40 | chicken_raw
Whole Chicken 1.2kg (kg) | دجاج كامل | kg | 3.30 | chicken_raw
Chicken Thighs Boneless (kg) | وراك دجاج بدون عظم | kg | 5.80 | chicken_raw
Chicken Wings (kg) | أجنحة دجاج | kg | 4.20 | chicken_raw
Chicken Shawarma Marinated (kg) | شاورما دجاج متبلة | kg | 6.90 | shawarma
Shish Taouk Marinated (kg) | شيش طاووق متبل | kg | 6.60 | grilled_meat_skewers
Turkey Breast (kg) | صدر ديك رومي | kg | 10.50 | chicken_raw
`),
      'Deli & Frozen': parse(`
Sujuk (kg) | سجق | kg | 12.50 | minced_meat
Basturma (kg) | بسطرمة | kg | 28.00 | beef_steak
Beef Bacon 500g | بيكون بقر 500 غ | pack | 8.50 | minced_meat
Lebanese Beef Sausage - Makanek (kg) | مقانق لبنانية | kg | 11.00 | minced_meat
Frozen Kibbeh 1kg (pcs) | كبة مقلية مجمدة 1 كلغ | pack | 11.00 | minced_meat
Frozen Cheese Sambousek 1kg | سمبوسك جبنة مجمد 1 كلغ | pack | 8.50 | minced_meat
Frozen Meat Sambousek 1kg | سمبوسك لحمة مجمد 1 كلغ | pack | 9.50 | minced_meat
`),
    },
  },
  {
    key: 'levant',
    name: 'Levant Dry Goods',
    slug: 'levant-dry-goods',
    plan: 'platinum',
    city: 'Beirut',
    area: 'Dekwaneh Industrial',
    lat: 33.8807,
    lng: 35.5527,
    phone: '+961 1 685 400',
    logoImg: 'warehouse_shelves',
    coverImg: 'warehouse_shelves',
    paymentTerms: 'Net 30',
    minOrder: 75,
    skuPrefix: 'LDG',
    owner: { first: 'Samir', last: 'Jabbour', email: 'samir.jabbour@levantdrygoods.demo' },
    team: [
      { first: 'Carla', last: 'Sfeir', email: 'carla.sfeir@levantdrygoods.demo', role: 'Supplier Manager' },
      { first: 'Bassam', last: 'Hamdan', email: 'bassam.hamdan@levantdrygoods.demo', role: 'Warehouse Manager' },
      { first: 'Lina', last: 'Gemayel', email: 'lina.gemayel@levantdrygoods.demo', role: 'Accountant' },
      { first: 'Ziad', last: 'Karam', email: 'ziad.karam@levantdrygoods.demo', role: 'Driver', driver: true, vehicle: 'Box truck', plate: 'B 774512' },
    ],
    warehouses: [
      { name: 'Dekwaneh Main Warehouse', code: 'DEK', type: 'dry_goods', main: true, share: 0.7 },
      { name: 'Saida Distribution Depot', code: 'SDA', type: 'dry_goods', main: false, share: 0.3 },
    ],
    categories: {
      'Grains & Legumes': parse(`
Burghul Fine 5kg | برغل ناعم 5 كلغ | bag | 7.50 | bulgur
Burghul Coarse 5kg | برغل خشن 5 كلغ | bag | 7.50 | bulgur
Freekeh Cracked 1kg | فريكة مجروشة 1 كلغ | pack | 4.20 | bulgur
Egyptian Rice 25kg | أرز مصري 25 كلغ | sack | 24.00 | rice
Basmati Rice 5kg | أرز بسمتي 5 كلغ | bag | 12.00 | rice
Red Lentils 5kg | عدس أحمر 5 كلغ | bag | 8.50 | lentils_chickpeas
Brown Lentils 5kg | عدس بجبة 5 كلغ | bag | 9.00 | lentils_chickpeas
Chickpeas 5kg | حمص حب 5 كلغ | bag | 9.50 | lentils_chickpeas
Fava Beans 5kg | فول حب 5 كلغ | bag | 8.00 | lentils_chickpeas
White Beans 5kg | فاصولياء بيضاء 5 كلغ | bag | 9.00 | lentils_chickpeas
Moghrabieh Pearl Couscous 1kg | مغربية 1 كلغ | pack | 3.80 | rice
Spaghetti 5kg | سباغيتي 5 كلغ | box | 7.50 | pasta
Penne 5kg | بيني 5 كلغ | box | 7.50 | pasta
All-purpose Flour 25kg | طحين متعدد الاستعمال 25 كلغ | sack | 17.00 | flour
Bread Flour 25kg | طحين خبز 25 كلغ | sack | 18.00 | flour
Semolina 25kg | سميد 25 كلغ | sack | 19.00 | flour
`),
      'Oils, Condiments & Canned': parse(`
Tahini 18kg bucket | طحينة 18 كلغ | bucket | 64.00 | tahini
Tahini 1kg Jar | طحينة 1 كلغ | jar | 5.20 | tahini
Extra Virgin Olive Oil 5L | زيت زيتون بكر ممتاز 5 ليتر | can | 38.00 | olive_oil | Cedar Grove
Extra Virgin Olive Oil 1L | زيت زيتون بكر ممتاز 1 ليتر | bottle | 8.50 | olive_oil | Cedar Grove
Olive Pomace Oil 5L | زيت زيتون بومايس 5 ليتر | can | 22.00 | olive_oil
Sunflower Oil 18L | زيت دوار الشمس 18 ليتر | can | 32.00 | olive_oil
Vegetable Ghee 4kg | سمنة نباتية 4 كلغ | can | 14.00 | butter
Pomegranate Molasses 1L | دبس رمان 1 ليتر | bottle | 5.80 | pomegranate_molasses
Grape Molasses 1L | دبس عنب 1 ليتر | bottle | 5.00 | pomegranate_molasses
Apple Cider Vinegar 1L | خل تفاح 1 ليتر | bottle | 1.60 | pomegranate_molasses
Rose Water 1L | ماء ورد 1 ليتر | bottle | 4.50 | pomegranate_molasses
Orange Blossom Water 1L | ماء زهر 1 ليتر | bottle | 4.50 | pomegranate_molasses
Tomato Paste 4.5kg Can | معجون بندورة 4.5 كلغ | can | 8.50 | canned_goods
Tomato Paste 800g | معجون بندورة 800 غ | can | 2.10 | canned_goods
Canned Chickpeas 2.5kg | حمص معلب 2.5 كلغ | can | 4.60 | canned_goods
Foul Medames 400g (case 24) | فول مدمس 400 غ (24 علبة) | case | 18.00 | canned_goods
Green Olives 5kg Pail | زيتون أخضر 5 كلغ | pail | 14.00 | olives
Black Olives 5kg Pail | زيتون أسود 5 كلغ | pail | 15.00 | olives
Pickled Cucumbers 5kg | مخلل خيار 5 كلغ | pail | 11.00 | olives
Pickled Turnips 2.5kg | مخلل لفت 2.5 كلغ | pail | 6.50 | olives
Capers 1kg | قبار 1 كلغ | jar | 7.00 | olives
Mayonnaise 3.5L | مايونيز 3.5 ليتر | tub | 9.00 | canned_goods
Ketchup 3.5L | كاتشب 3.5 ليتر | tub | 6.50 | canned_goods
Hummus Ready Mix 2kg | حمص جاهز 2 كلغ | tub | 7.50 | hummus
`),
      'Spices & Seasonings': parse(`
Sumac 1kg | سماق 1 كلغ | pack | 14.00 | spices_sumac
Za'atar Mix 1kg | زعتر مشكل 1 كلغ | pack | 11.50 | zaatar
Seven Spices - Baharat 1kg | بهارات مشكلة 1 كلغ | pack | 13.00 | spices_sumac
Ground Cumin 1kg | كمون مطحون 1 كلغ | pack | 9.00 | spices_sumac
Ground Coriander 1kg | كزبرة مطحونة 1 كلغ | pack | 7.50 | spices_sumac
Paprika 1kg | بابريكا 1 كلغ | pack | 9.00 | spices_sumac
Ground Black Pepper 1kg | فلفل أسود مطحون 1 كلغ | pack | 14.00 | spices_sumac
Cardamom Whole 250g | هيل حب 250 غ | pack | 12.00 | spices_sumac
Turmeric 1kg | كركم 1 كلغ | pack | 7.00 | spices_sumac
Chili Flakes 1kg | شطة مجروشة 1 كلغ | pack | 8.50 | spices_sumac
Dried Mint 500g | نعناع مجفف 500 غ | pack | 5.00 | mint
Dried Thyme 1kg | زعتر مجفف 1 كلغ | pack | 10.00 | zaatar
Fine Salt 25kg | ملح ناعم 25 كلغ | sack | 9.00 | spices_sumac
Coarse Salt 25kg | ملح خشن 25 كلغ | sack | 8.00 | spices_sumac
Citric Acid 1kg | ملح ليمون 1 كلغ | pack | 3.50 | spices_sumac
`),
      'Nuts, Sweets & Bakery': parse(`
Pine Nuts 1kg | صنوبر 1 كلغ | pack | 38.00 | nuts_pistachio
Raw Pistachios 1kg | فستق حلبي 1 كلغ | pack | 20.00 | nuts_pistachio
Almonds 1kg | لوز 1 كلغ | pack | 11.00 | nuts_pistachio
Walnut Halves 1kg | جوز 1 كلغ | pack | 9.50 | nuts_pistachio
Cashews 1kg | كاجو 1 كلغ | pack | 12.50 | nuts_pistachio
Dried Apricots 1kg | قمر الدين 1 كلغ | pack | 8.00 | dates_dried_fruit
Medjool Dates 1kg | تمر مجدول 1 كلغ | pack | 11.00 | dates_dried_fruit
Sesame Seeds 1kg | سمسم 1 كلغ | pack | 4.20 | tahini
Pure Honey 1kg | عسل نقي 1 كلغ | jar | 12.00 | honey
Sugar 50kg Sack | سكر 50 كلغ | sack | 40.00 | flour
Kataifi Dough 500g | عصمللية 500 غ | pack | 3.80 | kunafa_dessert
Phyllo Dough 1kg | عجينة فيلو 1 كلغ | pack | 3.20 | kunafa_dessert
Arabic Bread (pack of 10) | خبز عربي (10 أرغفة) | pack | 1.20 | pita_bread
Large Pita Bread (pack of 6) | خبز كبير (6 أرغفة) | pack | 1.40 | pita_bread
Saj Bread (pack of 10) | خبز صاج (10) | pack | 2.20 | pita_bread
Mini Burger Buns (pack of 12) | خبز برغر صغير (12) | pack | 2.60 | croissant_bakery
Butter Croissants (pack of 12) | كرواسان زبدة (12) | pack | 7.50 | croissant_bakery
`),
    },
  },
  {
    key: 'beverage',
    name: 'Beirut Beverage Distribution',
    slug: 'beirut-beverage-distribution',
    plan: 'gold',
    city: 'Beirut',
    area: 'Jdeideh',
    lat: 33.8872,
    lng: 35.5586,
    phone: '+961 1 888 245',
    logoImg: 'soft_drinks',
    coverImg: 'soft_drinks',
    paymentTerms: 'Net 30',
    minOrder: 90,
    skuPrefix: 'BBD',
    owner: { first: 'Hussein', last: 'Zein', email: 'hussein.zein@beirutbeverage.demo' },
    team: [
      { first: 'Tamara', last: 'Bitar', email: 'tamara.bitar@beirutbeverage.demo', role: 'Accountant' },
      { first: 'Ali', last: 'Fakhoury', email: 'ali.fakhoury@beirutbeverage.demo', role: 'Driver', driver: true, vehicle: 'Beverage lorry', plate: 'B 884103' },
    ],
    warehouses: [{ name: 'Jdeideh Beverage Depot', code: 'JDB', type: 'standard', main: true, share: 1 }],
    categories: {
      'Water & Soft Drinks': parse(`
Mineral Water 24x500ml | مياه معدنية 24x500 مل | case | 4.50 | water_bottles
Mineral Water 12x1.5L | مياه معدنية 12x1.5 ليتر | case | 3.60 | water_bottles
Sparkling Water 24x330ml | مياه غازية 24x330 مل | case | 14.00 | water_bottles
Cola 24x330ml Cans | كولا 24x330 مل | case | 12.00 | soft_drinks
Cola 12x1L | كولا 12x1 ليتر | case | 8.50 | soft_drinks
Lemon-Lime Soda 24x330ml | ليمون غازي 24x330 مل | case | 12.00 | soft_drinks
Tonic Water 24x200ml | تونيك 24x200 مل | case | 13.00 | soft_drinks
Energy Drink 24x250ml | مشروب طاقة 24x250 مل | case | 28.00 | soft_drinks
Peach Ice Tea 24x330ml | شاي مثلج خوخ 24x330 مل | case | 16.00 | juice
Orange Juice 12x1L | عصير برتقال 12x1 ليتر | case | 18.00 | juice
Apple Juice 12x1L | عصير تفاح 12x1 ليتر | case | 16.00 | juice
Rose Syrup 1L | شراب ورد 1 ليتر | bottle | 4.80 | juice
Jallab Syrup 1L | شراب جلاب 1 ليتر | bottle | 6.00 | juice
Ice Bag 10kg | ثلج مكعبات 10 كلغ | bag | 2.80 | water_bottles
`),
      'Spirits, Wine & Beer': parse(`
Arak 1L | عرق 1 ليتر | bottle | 17.50 | arak_anise_bottle | Bekaa Gold
Arak 70cl | عرق 70 سل | bottle | 13.00 | arak_anise_bottle | Bekaa Gold
Lebanese Red Wine 75cl | نبيذ أحمر لبناني 75 سل | bottle | 11.00 | wine_bottles
Lebanese White Wine 75cl | نبيذ أبيض لبناني 75 سل | bottle | 11.00 | wine_bottles
Lebanese Rose Wine 75cl | نبيذ روزيه لبناني 75 سل | bottle | 10.50 | wine_bottles
Craft Lebanese Lager 24x330ml | بيرة لبنانية 24x330 مل | case | 28.00 | wine_bottles
Premium Lager 24x500ml | بيرة 24x500 مل | case | 30.00 | wine_bottles
Vodka 70cl | فودكا 70 سل | bottle | 14.00 | wine_bottles
Blended Whisky 1L | ويسكي 1 ليتر | bottle | 24.00 | wine_bottles
London Dry Gin 70cl | جن 70 سل | bottle | 17.00 | wine_bottles
`),
      'Coffee & Tea': parse(`
Turkish Coffee Ground 1kg | قهوة تركية 1 كلغ | pack | 14.00 | coffee_beans
Cardamom Arabic Coffee 1kg | قهوة عربية بالهيل 1 كلغ | pack | 16.00 | coffee_beans
Espresso Beans 1kg | حبوب إسبريسو 1 كلغ | pack | 22.00 | coffee_beans
Instant Coffee 500g | نسكافيه 500 غ | jar | 9.50 | coffee_beans
Black Tea 100 Bags | شاي أسود 100 كيس | box | 3.80 | tea
Herbal Tea Assortment 100 Bags | أعشاب مشكلة 100 كيس | box | 5.50 | tea
Hot Chocolate Powder 1kg | شوكولا ساخنة 1 كلغ | pack | 8.00 | coffee_beans
`),
    },
  },
  {
    key: 'coastline',
    name: 'Coastline Packaging & Hygiene',
    slug: 'coastline-packaging-hygiene',
    plan: 'free',
    city: 'Jounieh',
    area: 'Kaslik',
    lat: 33.9769,
    lng: 35.6159,
    phone: '+961 9 640 880',
    logoImg: 'packaging_boxes',
    coverImg: 'packaging_boxes',
    paymentTerms: 'Net 15',
    minOrder: 50,
    skuPrefix: 'CPH',
    owner: { first: 'Joelle', last: 'Maalouf', email: 'joelle.maalouf@coastlinepack.demo' },
    team: [],
    warehouses: [{ name: 'Kaslik Warehouse', code: 'KSL', type: 'dry_goods', main: true, share: 1 }],
    categories: {
      Packaging: parse(`
Takeaway Containers 750ml (case 500) | علب سفري 750 مل (500) | case | 38.00 | takeaway_containers
Aluminium Foil Roll 45cm 3kg | ورق ألمنيوم 45 سم 3 كلغ | roll | 14.00 | aluminium_foil
Cling Film 45cm 1.5kg | نايلون تغليف 45 سم | roll | 9.00 | aluminium_foil
Kraft Paper Bags (case 250) | أكياس ورق كرافت (250) | case | 22.00 | packaging_boxes
Pizza Box 30cm (case 100) | علب بيتزا 30 سم (100) | case | 15.00 | pizza
Burger Box (case 200) | علب برغر (200) | case | 18.00 | burger
Paper Cups 8oz (case 1000) | أكواب ورق 8 أونص (1000) | case | 32.00 | takeaway_containers
Cup Lids 8oz (case 1000) | أغطية أكواب (1000) | case | 14.00 | takeaway_containers
Plastic Cutlery Set (case 500) | طقم أدوات بلاستيك (500) | case | 20.00 | takeaway_containers
Wooden Cutlery Set (case 500) | طقم أدوات خشب (500) | case | 26.00 | takeaway_containers
Paper Napkins (case 20x100) | محارم ورقية (20x100) | case | 19.00 | paper_napkins
Paper Straws (case 5000) | قشات ورق (5000) | case | 21.00 | takeaway_containers
Shawarma Wrap Paper (case 1000) | ورق شاورما (1000) | case | 11.00 | paper_napkins
Thermal Receipt Rolls (case 50) | رولات حرارية (50) | case | 25.00 | packaging_boxes
`),
      'Cleaning & Hygiene': parse(`
Nitrile Gloves Box 100 | قفازات نتريل 100 | box | 5.50 | gloves
Disposable Aprons (pack 100) | مرايل للاستعمال الواحد (100) | pack | 6.00 | gloves
Garbage Bags 100L (roll of 10) | أكياس نفايات 100 ليتر (10) | roll | 3.20 | cleaning_supplies
Dish Soap 5L | سائل جلي 5 ليتر | can | 6.50 | dish_soap
Kitchen Degreaser 5L | مزيل شحوم 5 ليتر | can | 8.50 | cleaning_supplies
Floor Cleaner 5L | منظف أرضيات 5 ليتر | can | 7.00 | cleaning_supplies
Bleach 4L | كلور 4 ليتر | bottle | 3.50 | cleaning_supplies
Hand Soap 5L | صابون أيدي 5 ليتر | can | 7.50 | dish_soap
Surface Sanitizer 5L | معقم أسطح 5 ليتر | can | 9.00 | cleaning_supplies
Dishwasher Detergent 20L | منظف غسالة صحون 20 ليتر | can | 38.00 | dish_soap
Rinse Aid 5L | مساعد شطف 5 ليتر | can | 12.00 | dish_soap
Scouring Sponges (pack 10) | إسفنج جلي (10) | pack | 3.20 | cleaning_supplies
Microfibre Cloths (pack 10) | قماش ميكروفايبر (10) | pack | 6.50 | cleaning_supplies
Toilet Paper (case 48) | مناديل حمام (48) | case | 22.00 | paper_napkins
Paper Towel Rolls (case 6) | رولات مطبخ (6) | case | 14.00 | paper_napkins
`),
    },
  },
]

/** Restaurant tenants. `org` groups branch accounts under one organization. */
export const RESTAURANTS = [
  {
    key: 'riviera',
    name: 'Riviera Beirut Hotel',
    slug: 'riviera-beirut-hotel',
    plan: 'platinum',
    org: 'Riviera Hotels Group',
    orgSlug: 'riviera-hotels-group',
    main: true,
    branchCode: 'BEY',
    type: 'Hotel',
    area: 'Ain El Mreisseh',
    city: 'Beirut',
    lat: 33.9002,
    lng: 35.4777,
    phone: '+961 1 360 100',
    logoImg: 'hotel_exterior',
    owner: { first: 'Rami', last: 'Haddad', email: 'rami.haddad@rivierahotels.demo' },
    team: [
      { first: 'Nour', last: 'Khoury', email: 'nour.khoury@rivierahotels.demo', role: 'Restaurant Manager' },
      { first: 'Elie', last: 'Abboud', email: 'elie.abboud@rivierahotels.demo', role: 'Purchaser' },
      { first: 'Sara', last: 'Younes', email: 'sara.younes@rivierahotels.demo', role: 'Receiving Staff' },
      { first: 'George', last: 'Matar', email: 'george.matar@rivierahotels.demo', role: 'Accountant' },
      { first: 'Dina', last: 'Khalifeh', email: 'dina.khalifeh@rivierahotels.demo', role: 'Viewer' },
      { first: 'Maher', last: 'Issa', email: 'maher.issa@rivierahotels.demo', role: 'FOH Staff' },
    ],
  },
  {
    key: 'riviera-jounieh',
    name: 'Riviera Jounieh Resort',
    slug: 'riviera-jounieh-resort',
    org: 'Riviera Hotels Group',
    branch: true,
    branchCode: 'JNH',
    type: 'Hotel',
    area: 'Kaslik',
    city: 'Jounieh',
    lat: 33.9755,
    lng: 35.6178,
    phone: '+961 9 930 200',
    logoImg: 'hotel_lobby',
    owner: { first: 'Joumana', last: 'Azar', email: 'joumana.azar@rivierahotels.demo' },
    team: [],
  },
  {
    key: 'riviera-byblos',
    name: 'Riviera Byblos Boutique Hotel',
    slug: 'riviera-byblos-boutique-hotel',
    org: 'Riviera Hotels Group',
    branch: true,
    branchCode: 'BYB',
    type: 'Hotel',
    area: 'Old Souk',
    city: 'Byblos',
    lat: 34.123,
    lng: 35.6519,
    phone: '+961 9 540 330',
    logoImg: 'hotel_exterior',
    owner: { first: 'Hadi', last: 'Sleiman', email: 'hadi.sleiman@rivierahotels.demo' },
    team: [],
  },
  {
    key: 'riviera-batroun',
    name: 'Riviera Batroun Beach Club',
    slug: 'riviera-batroun-beach-club',
    org: 'Riviera Hotels Group',
    branch: true,
    branchCode: 'BTR',
    type: 'Beach Club',
    area: 'Seaside Road',
    city: 'Batroun',
    lat: 34.2553,
    lng: 35.6586,
    phone: '+961 6 740 410',
    logoImg: 'restaurant_interior',
    owner: { first: 'Rita', last: 'Chami', email: 'rita.chami@rivierahotels.demo' },
    team: [],
  },
  {
    key: 'hamra',
    name: 'Hamra Bistro',
    slug: 'hamra-bistro',
    plan: 'gold',
    type: 'Bistro',
    area: 'Hamra Main Street',
    city: 'Beirut',
    lat: 33.8959,
    lng: 35.4828,
    phone: '+961 1 340 560',
    logoImg: 'bistro_table',
    b2c: true,
    owner: { first: 'Karl', last: 'Daou', email: 'karl.daou@hamrabistro.demo' },
    team: [
      { first: 'Nadia', last: 'Hakim', email: 'nadia.hakim@hamrabistro.demo', role: 'Restaurant Manager' },
      { first: 'Yara', last: 'Sabbagh', email: 'yara.sabbagh@hamrabistro.demo', role: 'Accountant' },
    ],
  },
  {
    key: 'byblosfish',
    name: 'Byblos Fish House',
    slug: 'byblos-fish-house',
    plan: 'silver',
    type: 'Seafood Restaurant',
    area: 'Byblos Harbour',
    city: 'Byblos',
    lat: 34.1209,
    lng: 35.6481,
    phone: '+961 9 540 770',
    logoImg: 'seafood_platter',
    owner: { first: 'Pierre', last: 'Eid', email: 'pierre.eid@byblosfishhouse.demo' },
    team: [],
  },
  {
    key: 'zaatar',
    name: 'Zaatar & Co. Bakery',
    slug: 'zaatar-and-co-bakery',
    plan: 'gold',
    type: 'Bakery & Cafe',
    area: 'Achrafieh',
    city: 'Beirut',
    lat: 33.8886,
    lng: 35.5163,
    phone: '+961 1 330 990',
    logoImg: 'bakery_storefront',
    b2c: true,
    owner: { first: 'Maria', last: 'Tabet', email: 'maria.tabet@zaatarcobakery.demo' },
    team: [],
  },
  {
    key: 'gemmayze',
    name: 'Gemmayze Kitchen',
    slug: 'gemmayze-kitchen',
    plan: 'silver',
    type: 'Restaurant',
    area: 'Gouraud Street',
    city: 'Beirut',
    lat: 33.8938,
    lng: 35.5183,
    phone: '+961 1 565 120',
    logoImg: 'restaurant_interior',
    owner: { first: 'Ghassan', last: 'Nakhle', email: 'ghassan.nakhle@gemmayzekitchen.demo' },
    team: [],
  },
  {
    key: 'marmikhael',
    name: 'Mar Mikhael Cafe',
    slug: 'mar-mikhael-cafe',
    plan: 'free',
    type: 'Cafe',
    area: 'Armenia Street',
    city: 'Beirut',
    lat: 33.8978,
    lng: 35.526,
    phone: '+961 1 444 330',
    logoImg: 'cafe_interior',
    owner: { first: 'Tala', last: 'Dagher', email: 'tala.dagher@marmikhaelcafe.demo' },
    team: [],
  },
  {
    key: 'jounieh',
    name: 'Jounieh Grill House',
    slug: 'jounieh-grill-house',
    plan: 'silver',
    type: 'Grill Restaurant',
    area: 'Maameltein',
    city: 'Jounieh',
    lat: 33.9808,
    lng: 35.6178,
    phone: '+961 9 910 640',
    logoImg: 'grilled_meat_skewers',
    owner: { first: 'Anwar', last: 'Bechara', email: 'anwar.bechara@jouniehgrill.demo' },
    team: [],
  },
]

export const PLATFORM_ADMIN = { first: 'Layal', last: 'Mrad', email: 'admin@horeca-demo.supplify.demo' }

/** Which restaurants buy from which suppliers (and relative order frequency). */
export const RELATIONS = {
  riviera: { cedar: 3, bekaa: 3, phoenicia: 2, meats: 3, levant: 3, beverage: 2, coastline: 1 },
  'riviera-jounieh': { cedar: 2, bekaa: 1, phoenicia: 1, meats: 1, levant: 1, beverage: 1 },
  'riviera-byblos': { cedar: 1, phoenicia: 1, levant: 1, beverage: 1 },
  'riviera-batroun': { phoenicia: 1, beverage: 2, cedar: 1 },
  hamra: { cedar: 2, bekaa: 2, meats: 2, levant: 2, beverage: 1, coastline: 1 },
  byblosfish: { phoenicia: 3, cedar: 1, levant: 1, beverage: 1 },
  zaatar: { levant: 3, bekaa: 2, cedar: 1, coastline: 2 },
  gemmayze: { cedar: 1, meats: 1, levant: 1, coastline: 1 },
  marmikhael: { beverage: 1, bekaa: 1, coastline: 1 },
  jounieh: { meats: 2, cedar: 1, levant: 1, beverage: 1 },
}

/** Customer-facing driver / customer chat lines. */
export const CHAT_SNIPPETS = [
  ['restaurant', 'Good morning! Can we add 10kg of tomatoes to tomorrow morning delivery?'],
  ['supplier', 'Good morning. Yes, no problem. I have added them to the order, the delivery window stays 7-9am.'],
  ['restaurant', 'Perfect. Also, is the sea bass fresh from today?'],
  ['supplier', 'Landed this morning at the port. I will send photos with the driver.'],
  ['restaurant', 'Thanks. Please make sure invoices go to our accounting email.'],
  ['supplier', 'Of course. Invoice will be issued once delivery is confirmed.'],
]

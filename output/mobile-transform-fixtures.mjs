const orders=[
 {id:'a1111111-1111-4111-8111-111111111111',restaurant_id:'r1',restaurant_name:'Cedar Kitchen',supplier_name:'Fresh Supply',customer_display_name:'Cedar Kitchen',status:'PLACED',total_amount:158.5,currency:'USD',created_at:'2026-11-15T08:00:00Z',items:[{id:'l1',product_id:'p1',product_name:'Extra virgin olive oil · 5 L',quantity:4,unit_price:39.625,line_total:158.5}]},
 {id:'b1111111-1111-4111-8111-111111111111',restaurant_id:'r1',restaurant_name:'Cedar Kitchen',supplier_name:'Lebanon Produce',status:'ACKNOWLEDGED',total_amount:12500000,currency:'LBP',created_at:'2026-11-15T07:00:00Z',items:[]},
];
const products=[{id:'p1',name:'Extra virgin olive oil · 5 L',supplier_id:'s1',supplier_name:'Fresh Supply',current_price:39.625,catalog_price:42,currency:'USD',unit:'bottle',sku:'OIL-5L',available_qty:72,moq:2,order_multiple:2,pricing_source:'CONTRACT_PRICE'},{id:'p2',name:'Organic tomatoes, freshly harvested, premium restaurant pack',supplier_id:'s1',current_price:4.5,currency:'USD',unit:'kg',sku:'TOM-01',available_qty:0}];
function dataFor(p,role,locale) {
 if(p==='/auth/me')return {id:'visual-user',email:'visual@example.invalid',displayName:'Visual User',locale,role,tenantRoles:role==='DRIVER'?['Driver']:['Owner'],tenantPermissions:role==='DRIVER'?['DRIVER_DELIVERIES_VIEW']:[],workspace:role==='CONSUMER'||role==='ADMIN'?undefined:{tenantId:'visual-workspace',tenantType:role==='DRIVER'?'SUPPLIER':role,tenantName:role==='RESTAURANT'?'Cedar Kitchen':'Fresh Supply',roleName:role==='DRIVER'?'Driver':'Owner'}};
 if(p.includes('entitlements'))return {entitlements:{tenantId:'visual-workspace',tenantType:role,plan:{name:'Visual review'},features:Object.fromEntries(['receiving_quality','quick_lists','finance_invoices','supplier_deals','inventory_management','chat','reservations','restaurant_reservations','fulfillment_tools','reports','ai_assistant','recipe_costing'].map(k=>[k,true]))}};
 if(p==='/api/orders')return {orders,pagination:{total:52,limit:50,offset:0}};
 if(p.startsWith('/api/orders/')&&p.endsWith('/amendments'))return {amendments:[]};
 if(p.startsWith('/api/orders/')&&p.endsWith('/tracking'))return {trackingEnabled:false};
 if(p.startsWith('/api/orders/'))return {order:orders.find(o=>p.endsWith(o.id))??orders[0]};
 if(p.includes('pending-orders'))return {orders:[]};
 if(p==='/api/suppliers')return {suppliers:[{id:'s1',name:'Fresh Supply',is_followed:true,product_count:36,minimum_order_amount:50}]};
 if(p.includes('price-comparison'))return {comparisons:[]};
 if(p==='/api/products')return {products,pagination:{total:2,hasMore:false}};
 if(p.endsWith('/categories'))return {categories:[]};
 if(p==='/api/notifications')return {notifications:[]};
 if(p.includes('deliveries/board'))return {orders:[],stops:[],summary:{}};
 if(p.includes('fulfillment/dispatch'))return {orders:[]};
 if(p.includes('chat/conversations'))return {conversations:[]};
 if(p==='/api/branches')return {accounts:[],branches:[],activeAccountId:'visual-workspace',tenantType:role};
 if(p.includes('public/features'))return {features:{mobile_public_shop:true},mobilePublicShop:true};
 if(p.includes('/reservations/board'))return {day:'2026-11-15',tables:[{id:'t1',name:'Window 01',capacity:4,is_active:true}],waitlist:[],reservations:[{id:'booking-1',customer_name:'Maya Haddad',customer_phone:'+961 00 000000',party_size:3,scheduled_at:'2026-11-15T18:00:00Z',duration_minutes:90,tables:['t1'],status:'CONFIRMED'}]};
 if(p.includes('inventory')||p.includes('expiry'))return {items:[],summary:{}};
 if(p.includes('reorder-assistance'))return {suggestions:[],summary:{total:0},quickLists:[],total:0};
 return {};
}

export { dataFor, orders };

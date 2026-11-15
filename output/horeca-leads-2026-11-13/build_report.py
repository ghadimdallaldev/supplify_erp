"""Build the requested HORECA prospecting research deliverables from public profiles."""
import collections
import csv
import html
import json
import os
from pathlib import Path
import re

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

OUT = Path(__file__).resolve().parent
SOURCE = Path(os.environ['TEMP']) / 'supplify-horeca-research'
ROWS = json.loads((SOURCE / 'companies_enriched.json').read_text(encoding='utf-8'))
DATE = '2026-11-13'
DIRECTORY = 'https://jublia.ai/HORECA-Lebanon/meet/s/companies'
assert len(ROWS) == 320
assert all((SOURCE / ('detail_' + r['id_object'] + '.json')).exists() for r in ROWS)

GROUPS = {
    'Food distribution': [44,69,70,83,87,90,101,114,127,128,174,191,203,204,213,258,260,280,299,300],
    'Meat and seafood': [12,103,118,141,154,201,283,288,308],
    'Dairy and eggs': [61,62,106,117,182,291],
    'Bakery and ingredients': [4,30,54,59,99,104,112,129,158,187,227,263,264,271,293],
    'Pantry and specialty food': [0,28,36,45,58,60,68,76,95,107,108,109,132,143,147,163,165,168,175,185,197,202,207,216,241,242,305,312],
    'Beverages': [3,20,21,35,38,42,53,66,67,77,122,135,150,169,232,236,255,259,261,272,281,311],
    'Coffee and tea': [31,32,33,37,124,205,257,270,289],
    'Packaging and hygiene': [105,115,126,153,239,251,254],
    'Hospitality supplies': [46,56,156,180,190,224,226,252],
    'Restaurant or caterer': [8,9,39,178,179,218,219],
    'Hotel buyer': [221,309],
    'Equipment and project supply': [1,14,22,23,26,55,63,64,85,96,98,102,134,136,138,140,146,151,166,176,196,199,206,208,211,243,246,250,253,296,297,301,302,307,310,317,318],
}
CLASS = {}
for segment, indexes in GROUPS.items():
    for i in indexes:
        assert i not in CLASS, (i, segment)
        CLASS[i] = ('Customer', segment)

PARTNER_GROUPS = {
    'Industry association or cluster': [5,7,17,24,25,27,47,49,50,51,52,65,88,130,139,159,161,162,167,172,184,231,266,273,274,275,276,277,278,279,292,294,295,303,314,319],
    'Hospitality consultancy': [111,120,131],
    'Hospitality education': [29,75,113,155,157,214,240,306],
    'Trade development': [78,79,80],
    'Hospitality media': [125,164,287],
    'Adjacent hospitality service': [16,220,223,234],
}
for segment, indexes in PARTNER_GROUPS.items():
    for i in indexes:
        assert i not in CLASS
        CLASS[i] = ('Partner', segment)

TECH = [15,43,73,74,91,100,116,137,210,212,215,217,222,237,244,247,248,229,313]
for i in TECH:
    assert i not in CLASS
    CLASS[i] = ('Technology ecosystem', 'Integration or competitive overlap')

QUALIFY = [2,11,81,86,97,121,148,152,171,173,177,181,186,198,228,233,249,262,265,284,285,290,304,316]
for i in QUALIFY:
    assert i not in CLASS
    CLASS[i] = ('Qualify first', 'Insufficient or conflicting profile information')

SUMMARIES = {}
SUMMARY_TEXT = '''
0|Local high-protein snacks and organic products
1|Commercial printing, branded packaging and signage
2|Food listing; profile website points to Faqra Catering
3|Distributor of alcoholic beverages and related products
4|Professional pastry ingredients, mixes and fillings
7|US meat-industry export and market-development association
8|Grilled-chicken restaurant operator
9|Second listing for Al Abdallah restaurant
10|Construction and contracting description despite a Food category
11|Food category; no product description
12|Processed meats, cold cuts, burgers and pickles
14|Commercial scales and food machinery distributor
15|IT, cloud, cybersecurity and automation provider
16|Passenger transport and corporate mobility operator
19|Petroleum import, storage and distribution
20|Natural mineral water producer
21|Arak brand; beverage category only
22|Commercial kitchen and laundry equipment distributor
23|Decorative articles and serving ware
26|Tabletop/interior supplier; UAE listing lacks a description
28|Olive oil and olive-derived products
30|Bakery, pastry and ice-cream ingredients plus equipment
31|Coffee brand serving espresso consumption
32|Products and expertise for baristas; product range needs confirmation
33|Specialty coffee sourcing, roasting and brewing products
35|Mineral water producer and beverage-sector supplier
36|Zaatar mixes and Lebanese specialty foods
37|Tea blends and infusions
38|Lebanese brewery
39|Burger and smoked-meat restaurant
42|Carob-based beverage brand
43|Supply-chain software platform
44|Food and beverage distributor serving retail and HORECA
45|Packaged nuts and roasted snacks
46|Tableware, kitchenware and hospitality distributor
47|Franco-Lebanese business network
53|Wine producer
54|Gelato ingredients, machinery and technical support
55|Commercial refrigeration and cold-storage systems
56|Hospitality products and supplies
58|Lebanese pantry ingredients explicitly marketed to professional kitchens
59|Bread improvers and industrial baking ingredients
60|Spice and herb manufacturer
61|Lebanese dairy producer
62|Labneh, yoghurt, milk and other dairy products
63|Commercial scales and retail automation equipment
64|Commercial kitchen, bakery and refrigeration equipment
66|Artisan cider producer
67|Wine and olive-growing estate
68|Artisanal cheese, charcuterie, condiments and preserved foods
69|Foodstuff importer and distributor
70|EAM listing for Bel/Kiri dairy brands
71|Renewable-energy project provider
73|Business software and hardware developer
74|Restaurant POS, kitchen, accounting and operations software
76|Dragees and confectionery for professional customers
77|Craft brewery
81|Food category; no operational description
83|FMCG, food and beverage importer/distributor serving HORECA
85|Engineering and commercial equipment solutions
86|Country and name only; food activity needs confirmation
87|Group distributing beverages and FMCG among other businesses
89|White-label products for the roll-your-own industry
90|Importer/distributor of chilled and frozen foods
91|Combined restaurant POS and payment-provider listing
95|Confectionery and snack manufacturer
96|Professional knives, culinary tools and foodservice products
97|Interiors category only; actual hospitality range unknown
98|Corrugated cardboard and packaging manufacturer
99|Gelato/pastry equipment and recurring ingredients
100|Managed IT services provider
101|International ingredients supplier explicitly serving restaurants and hotels
102|Packaging machinery and processing equipment
103|Frozen meats, poultry, seafood and vegetable distributor
104|Pastry and bakery producer
105|Packaging, disposables, tissues and hygiene supplies for HORECA
106|Goat-dairy producer
107|Grape molasses and related specialty foods
108|Estate olive oil producer
109|Fresh artisan pasta producer
111|Customer-experience and operations consultancy
112|Dessert powders, drinks and baking/cooking ingredients
114|Foodservice supplier; short profile states foodservice positioning
115|Paper/carton bags and custom packaging
116|POS software provider
117|Dairy importer/distributor associated with Lactalis
118|Frozen French fries producer
120|Hospitality, franchise and business consultancy
121|Interiors listing links to a gas company; identity needs checking
122|Beverage ingredients, syrups, purees and bar products for HORECA
124|Tea and beverage blends
126|Cleaning chemicals, dispensing systems and hygiene solutions
127|Kallassi/GroupKA listing spanning FMCG, logistics and restaurants
128|Second I. Hakim Dowek listing with the same GroupKA website
129|Ice cream and frozen-novelty manufacturer/distributor
131|Franchise, food-safety and operational consultancy
132|Chreim Foods listing for Impact Mints confectionery
134|Commercial/industrial refrigeration systems
135|Private-label and co-packed beverages
136|Commercial kitchen equipment and installation
137|HR-management software
138|Packaging films, labels, adhesives and machinery
140|Professional kitchen equipment supplier
141|Mayonnaise and other food-product manufacturer
143|Honey producer
146|Tinplate printing and canning; category-only Jordan listing
147|Armenian-Lebanese pantry foods, preserves and sweets
148|Food category; sweets range and sales channel unspecified
150|Syrups, extracts and other beverages
151|HVAC and MEP engineering projects
152|Technology category; software purpose unspecified
153|Disposable foodservice tableware and packaging manufacturer
154|Duck, foie gras and other duck-product producer
156|Custom leather amenities for hotels and restaurants
158|Packaged foods supplying grocery and foodservice markets
163|Preserves, pickles, olive oil and traditional foods
165|Mediterranean pantry products and olive-derived goods
166|Commercial and domestic appliances
168|Premium olive oil
169|Juice, dairy and ice-cream manufacturer
171|Food category; no product description
173|Technology category; no product description
174|GMRL group with a HORECA distribution business
175|Roastery and nuts wholesaler
176|Flooring, carpets and interior projects
177|Services category; activity unspecified
178|Restaurant chain specializing in tawouk and fast food
179|Culinary experiences, consulting and related product businesses
180|Tableware, kitchenware, bar products and hotel amenities
181|Food category; no product description
182|Ghee, butter and cheese importer/distributor
183|Passenger airline
185|Natural instant soups and related food products
186|Food category; no product description
187|Packaged food and beverage manufacturer
188|Wood, diesel and gas stoves; foodservice use not established
189|Insurance services
190|Hospitality supplies company
191|Distributor of food and beverage brands
196|Plastic packaging and industrial plastic products
197|Organic honey producer
198|Packaging category, generic placeholder copy and questionable website match
199|Cold rooms and refrigerated vehicle bodies
201|Wild seafood in preserved and frozen formats
202|Bulgur, grains, zaatar, spices and pantry essentials
203|Food importer/distributor with cold-chain logistics
204|Importer/distributor of specialty meat and premium ingredients
205|Specialty tea, matcha, mate and beverage accessories
206|Diversified metals, equipment and packaging group
207|Potato convenience foods; profile location requires verification
208|Gas supply; no product/ordering detail
210|Marketplace for selling surplus food
211|Custom plastic products; foodservice application needs checking
212|Technology-led grocery and consumer delivery platform
213|F&B importer/distributor with hospitality customers
215|Business ERP software vendor
216|Olive-derived pantry products
217|POS and ERP software provider
218|Tex-Mex restaurant, delivery and catering concept
219|Gluten-free bakery described as Sea Slim
220|Pest-control listing without service details
221|Phoenicia hotel, listed as a supporting hotel
222|Restaurant reservation and floor-management software
223|Renewable-biofuel feedstock sourcing and aggregation
224|Hospitality serving products
225|Insurance and reinsurance services
226|Products for restaurant delivery and takeaway operations
227|Artisan bread producer supplying the restaurant market
228|Services category; actual activity unspecified
229|Reservation and guest-management software
232|Energy-drink brand and beverage products
233|Technology category; website provided but no description
234|Pest control, food safety and hygiene services
236|Natural mineral water
237|ERP, accounting, stock and multi-branch management software
239|Cleaning products, packaging, catering supplies and hotel amenities
241|Olive oil, olives and related pantry products
242|Second Saifan listing with the same website domain
243|Heating systems and related equipment
244|Business messaging and communication platform
246|Food-processing machinery manufacturer
247|F&B staff scheduling, payroll and operating checklists
248|Restaurant reservations, guest CRM and marketing platform
249|Bulk feed ingredients and vegetable oils; HORECA relevance unclear
250|Pest-control and public-health chemicals
251|Hotel amenities, restaurant supplies and tissue products
252|Tableware and hospitality product distributor
253|Professional coffee equipment; regional category-only listing
254|Custom bags and recyclable packaging
255|Coffee creamer products
256|Insurance provider
257|Professional coffee products and related brands
258|Food/beverage importer with B2B on-trade and off-trade channels
259|Pepsi bottler and beverage distributor
260|FMCG distribution business
261|Water and beverage distributor
262|Interiors/amenities category; exact range unspecified
263|Wholesale bakery of crackers, breadsticks and baked snacks
264|Chocolate and confectionery producer
265|Food category; bakery activity needs confirmation
267|Construction insulation products
270|Wholesale green/roasted coffee and coffee accessories
271|Retail/wholesale bakery with multiple branches and factories
272|Food and beverage importer/distributor
280|Broad food-products portfolio; HORECA channel needs confirmation
281|Water brand
283|Poultry producer and meat processor
284|Food category; supplier versus caterer role unspecified
285|Food category; product details absent
288|Liban Frites frozen-fries producer serving foodservice
289|Tea, herbs, fruits and spice blends
290|Technology category; software/hardware activity unspecified
291|Pasteurized egg products for professional and industrial customers
293|Foodservice mezze in professional pack sizes
296|Commercial kitchen and laundry equipment projects
297|Refrigeration and grill-equipment manufacturer
299|FMCG import and distribution group; Oatly-branded listing
300|Premium food distributor with warehouses and refrigerated delivery fleet
301|Stainless steel and commercial kitchen equipment
302|Bulk gas supply and gas-system projects
304|Beverage category; activity unspecified
305|Yamama condiments, syrups and pantry staples
307|Retail fit-out and supermarket equipment projects
308|Shuman Farms poultry producer
309|voco hotel listing
310|Commercial foodservice and laundry equipment projects
311|Beverages and condiments
312|Tahini, halva and lokum manufacturer
313|Digital payments and money-transfer provider
316|Saudi food listing; product and Lebanese distribution route unspecified
317|Industrial packaging and manufacturing-line equipment
318|Handmade ceramic tableware, vessels and lighting
319|QOOT agrifood cluster; company-name field is blank
'''
for line in SUMMARY_TEXT.strip().splitlines():
    key, summary = line.split('|', 1)
    SUMMARIES[int(key)] = summary

TOP = [101,300,90,204,69,44,213,122,4,105,293,227,61,62,118,288,270,33,114,99,30,182,117,83,203,174,127,258,259,260,299,12,141,158,202,103,178,8,221,309,180,239,56,251,271]
RANK = {i: rank for rank, i in enumerate(TOP, 1)}
RELATED = {9:8,70:83,128:127,242:241}

PITCHES = {
    'Food distribution': 'Offer restaurant self-service ordering, customer-specific pricing, a shared catalog, fulfillment visibility and receivables tracking.',
    'Meat and seafood': 'Offer recurring restaurant orders, stock/expiry visibility, receiving records and delivery tracking; assess pack sizes and handling requirements.',
    'Dairy and eggs': 'Offer scheduled reorders, stock/expiry visibility, delivery coordination and invoices for recurring foodservice customers.',
    'Bakery and ingredients': 'Offer repeat ingredient/product orders, customer catalogs, inventory visibility and delivery scheduling for bakeries and restaurants.',
    'Pantry and specialty food': 'Offer a wholesale catalog and restaurant discovery, repeat orders and invoicing; confirm pack sizes and B2B delivery coverage.',
    'Beverages': 'Offer repeat cafe, bar and hotel orders, account pricing, dispatch visibility and invoices; qualify any special product restrictions.',
    'Coffee and tea': 'Offer wholesale cafe ordering, scheduled bean/tea reorders, account-specific prices and delivery visibility.',
    'Packaging and hygiene': 'Offer repeat orders for consumables, customer catalogs, stock visibility and invoicing across restaurant and hotel accounts.',
    'Hospitality supplies': 'Offer catalog ordering and quote requests for hospitality products; prioritize replenishable items and confirm the sales model.',
    'Restaurant or caterer': 'Offer supplier discovery, consolidated purchasing, receiving, inventory/expiry visibility, invoices and branch-level purchasing controls.',
    'Hotel buyer': 'Offer supplier ordering, procurement/receiving visibility and invoice coordination across F&B outlets; assess existing hotel purchasing systems.',
    'Equipment and project supply': 'Possible catalog and RFQ fit. Confirm standardized products or replenishable spares; installation, manufacturing and project ERP needs require separate discovery.',
    'Industry association or cluster': 'Explore member introductions, supplier onboarding, restaurant recruitment or a small member pilot; association membership does not imply endorsement.',
    'Hospitality consultancy': 'Explore client referrals and a procurement/order-management pilot with restaurant or supplier clients.',
    'Hospitality education': 'Possible student/operator demonstrations and future introductions; lower immediate revenue potential than operating businesses.',
    'Trade development': 'Explore introductions to food exporters/importers and Lebanese distribution partners; no direct software-buying signal.',
    'Hospitality media': 'Potential industry visibility and introductions; qualify audience and commercial terms separately.',
    'Adjacent hospitality service': 'Possible referrals or a narrowly scoped collaboration. Its main service is outside the core product-ordering proposition.',
    'Integration or competitive overlap': 'Assess procurement complementarity, integration and client referrals. Check competitive overlap before sharing product or commercial details.',
    'Insufficient or conflicting profile information': 'Confirm the actual business, restaurant/hotel customer base, recurring ordering needs and decision maker before qualifying as a prospect.',
}
PARTNER_HIGH = {7,24,25,47,52,111,120,131,159,184,274,276,277,279,292,294,303,319}
OVERLAP = {43,74,91,116,210,212,215,217,222,237,247,248,229}

NOTES = {
    2:'Food category and a catering website are present, but the company description is blank. Confirm whether Aarka/Faqra Catering is the purchasing account.',
    10:'Directory Food tag conflicts with a construction/contracting description. Excluded from food/procurement prospect list on current evidence.',
    26:'UAE company: qualify local availability, sales coverage and fulfillment before proposing a Lebanon pilot.',
    30:'Tagged Catering Equipment, but its description explicitly includes recurring bakery/pastry ingredients.',
    31:'Profile identifies a connection with Lebanese Roasting Group/Castania. Coordinate group-level outreach.',
    45:'Related to the Barista/coffee group in the directory. Coordinate group-level outreach.',
    64:'Packaging category conflicts with an equipment-focused description; assessed as equipment supplier.',
    70:'Same EAM website as Ets. Antoine Massoud. Combined into one outreach entry; both directory records retained in All 320.',
    89:'Catering Equipment tag conflicts with a roll-your-own manufacturing description. No clear restaurant-supply fit.',
    91:'Combined FOODICS/YALLA PAY entry: distinguish the restaurant POS vendor from the payments provider during qualification.',
    103:'Odoo publishes a Ghanem customer reference. Lead with ordering/marketplace complementarity and assess data integration; do not assume an ERP replacement opportunity. Source: https://www.odoo.com/ja_JP/customers/ghanem-frozen-foods-20170085',
    121:'HOME POINT is tagged interiors but links to natgaz.com.lb. Identity and category need confirmation.',
    127:'Two I. Hakim Dowek listings share the same Kallassi website. Combine into one group discussion; confirm which business unit owns purchasing/distribution.',
    128:'Related to I. Hakim Dowek & Sons; retained in All 320, combined for outreach.',
    133:'Impex Lebanon and Isuzu Impex are related automotive listings; neither is a core procurement-platform prospect.',
    146:'Jordan listing with no description/website. Regional packaging fit only; confirm product range and Lebanon distribution.',
    153:'Kuwait-based manufacturer. Confirm Lebanese distributor and ordering/fulfillment route.',
    174:'Group includes supermarket, distribution and F&B operations. Target the HORECA distribution business rather than assuming every unit fits.',
    198:'Placeholder description and mks.com website may refer to an unrelated business. Do not treat the supplied website as independently verified.',
    207:'Company name and description suggest a German manufacturer, while the event profile says Lebanon. Confirm the exhibiting representative, country and distribution model.',
    219:'Entry name PATE BOULANGER describes Sea Slim. Confirm legal/trading identity and wholesale versus retail operations.',
    239:'Tagged Techzone but its description is cleaning/packaging/hospitality supplies. Assessed on the description.',
    242:'Same Saifan website domain as Said Saifan. Combined for outreach; both event entries retained.',
    249:'Bulk animal-feed ingredients dominate the description. Confirm whether the vegetable-oil division sells foodservice pack sizes.',
    291:'Tagged Interiors but describes pasteurized egg products; assessed as food supplier. Syria listing: confirm Lebanon availability and fulfillment.',
    316:'Saudi food listing has no description. Confirm products, local distributor and Lebanon sales coverage.',
    319:'Directory company-name field is blank. Identified as QOOT from its own description and qoot.org website; this identification is an inference.',
}

def clean(value):
    value = html.unescape(re.sub(r'<[^>]+>', ' ', value or ''))
    return ' '.join(value.split())

def decide(i, r):
    kind, segment = CLASS.get(i, ('Not prioritized', 'Outside evidenced procurement fit'))
    if kind == 'Customer':
        priority = 'P1' if i in RANK else ('P3' if segment == 'Equipment and project supply' else 'P2')
    elif kind == 'Partner':
        priority = 'Partner 1' if i in PARTNER_HIGH else 'Partner 2'
    elif kind == 'Technology ecosystem':
        priority = 'Ecosystem'
    elif kind == 'Qualify first':
        priority = 'Qualify'
    else:
        priority = 'Skip for now'
    if i in RELATED:
        priority = 'Related entry'
    attrs = {a['attribute_name']: ', '.join(a['values']) for a in r.get('attributes', [])}
    country = attrs.get('Country', '').strip()
    if country.casefold() == 'lebanon':
        country = 'Lebanon'
    if country.upper() in {'JORDAN','KUWAIT','SAUDI ARABIA'}:
        country = country.title()
    summary = SUMMARIES.get(i, '')
    if not summary:
        summary = ('Directory category: ' + attrs['Category']) if attrs.get('Category') else ('Event listing: ' + (r.get('group_name') or 'unspecified'))
    if kind == 'Customer':
        contact = 'Owner / GM / commercial director / head of foodservice sales'
        if segment in {'Restaurant or caterer', 'Hotel buyer'}:
            contact = 'Owner / operations director / procurement manager / F&B director'
        question = 'How do restaurant/hotel orders arrive today, and which ordering, pricing or delivery step causes the most work?'
        if segment in {'Restaurant or caterer','Hotel buyer'}:
            question = 'How do your outlets order from suppliers and reconcile receiving, stock and invoices today?'
        if priority == 'P3':
            question = 'Do you sell repeat catalog items or spares to restaurants, or mainly custom projects and installation?'
    elif kind == 'Partner':
        contact = 'Executive director / partnerships lead / member-services manager'
        question = 'Could we run a small procurement/ordering pilot with a few of your restaurant or supplier members/clients?'
    elif kind == 'Technology ecosystem':
        contact = 'Partnerships lead / product lead / integrations lead'
        question = 'Where does your product stop in supplier procurement, and would an integration/referral arrangement make commercial sense?'
    elif kind == 'Qualify first':
        contact = 'Booth representative / owner / GM'
        question = 'What do you sell, who buys it, and do you serve restaurants or hotels through repeat B2B orders?'
    else:
        contact = ''
        question = ''
    confidence = 'High' if clean(r.get('description')) and kind != 'Qualify first' else 'Medium'
    if i in {21,26,114,146,208,253}:
        confidence = 'Medium'
    if kind == 'Qualify first':
        confidence = 'Low'
    reason = PITCHES.get(segment, 'No clear recurring restaurant-supply, restaurant purchasing or relevant partnership role established by the public profile.')
    if i == 318:
        reason = 'Possible wholesale catalog/RFQ fit for handmade restaurant tableware. Confirm hospitality customers, repeatable designs, capacity and lead times before qualifying.'
    if kind == 'Technology ecosystem' and i in OVERLAP:
        reason += ' Competitive overlap is material.'
    notes = NOTES.get(i, '')
    if i in RELATED:
        notes = (notes + ' Outreach grouped with ' + ROWS[RELATED[i]]['company_name'] + '.').strip()
    name = r.get('company_name') or 'QOOT (unnamed directory entry; inferred)'
    return {
        'Priority': priority,
        'Company': name,
        'Booth(s)': '; '.join(r.get('booths', [])) or 'Not listed',
        'Opportunity': kind,
        'Segment': segment,
        'What they do': summary,
        'Why Supplify may fit': reason,
        'Ask for': contact,
        'Opening question': question,
        'Evidence confidence': confidence,
        'Country (as listed)': country or 'Not listed',
        'Website (as published)': r.get('company_url') or '',
        'Directory profile': r.get('share_url') or DIRECTORY + '/?coid=' + r['id_object'],
        'Category (as listed)': attrs.get('Category', ''),
        'Event role': r.get('group_name') or '',
        'Research / relationship notes': notes,
        'Checked on': DATE,
        '_index': i,
    }

all_screened = [decide(i, r) for i, r in enumerate(ROWS)]
customers = [r.copy() for r in all_screened if r['Opportunity'] == 'Customer' and r['Priority'] != 'Related entry']
for row in customers:
    i = row['_index']
    children = [j for j, parent in RELATED.items() if parent == i]
    if children:
        row['Related listings'] = ' | '.join(ROWS[j]['company_name'] for j in children)
        booths = list(ROWS[i].get('booths', []))
        for j in children:
            booths.extend(ROWS[j].get('booths', []))
        row['Booth(s)'] = '; '.join(dict.fromkeys(booths)) or 'Not listed'
    else:
        row['Related listings'] = ''
customers.sort(key=lambda r: (r['Priority'], RANK.get(r['_index'], 999), r['Company'].casefold()))
partners = sorted([r for r in all_screened if r['Opportunity']=='Partner'], key=lambda r:(r['Priority'],r['Company'].casefold()))
ecosystem = sorted([r for r in all_screened if r['Opportunity']=='Technology ecosystem'],key=lambda r:r['Company'].casefold())
qualify = sorted([r for r in all_screened if r['Opportunity']=='Qualify first'],key=lambda r:r['Company'].casefold())
core = [r for r in customers if r['Priority'] in {'P1','P2'}]
adjacent = [r for r in customers if r['Priority']=='P3']

HEADER = ['Priority','Company','Booth(s)','Opportunity','Segment','What they do','Why Supplify may fit','Ask for','Opening question','Evidence confidence','Country (as listed)','Website (as published)','Directory profile','Category (as listed)','Event role','Research / relationship notes','Checked on']
def csv_file(name, rows, headers=HEADER):
    with (OUT/name).open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=headers,extrasaction='ignore')
        w.writeheader()
        for row in rows:
            safe={k: ("'"+str(row.get(k,'')) if str(row.get(k,'')).startswith(('=','+','-','@')) else row.get(k,'')) for k in headers}
            w.writerow(safe)

csv_file('Supplify_HORECA_Customer_Prospects.csv',customers,HEADER+['Related listings'])
csv_file('Supplify_HORECA_All_320_Screened.csv',all_screened)
csv_file('Supplify_HORECA_Partners.csv',partners)

counts=collections.Counter(r['Priority'] for r in customers)
stats={
    'directory_entries_screened':len(all_screened),
    'public_profiles_read':len(ROWS),
    'customer_prospect_entries_after_grouping':len(customers),
    'p1_clear_fit':counts['P1'],
    'p2_relevant':counts['P2'],
    'p3_adjacent':counts['P3'],
    'partner_entries':len(partners),
    'technology_ecosystem_entries':len(ecosystem),
    'qualify_first_entries':len(qualify),
    'related_entries_grouped':len(RELATED),
    'not_prioritized_entries':sum(r['Opportunity']=='Not prioritized' for r in all_screened),
}
assert len(customers)+len(partners)+len(ecosystem)+len(qualify)+len(RELATED)+stats['not_prioritized_entries']==320
(OUT/'research_counts.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')

wb=Workbook()
ws=wb.active
ws.title='Read me'
intro=[
    ['Supplify x HORECA Lebanon','Prospecting research - '+DATE],
    ['Source',DIRECTORY],
    ['Scope','All 320 public directory records and all 320 public profiles reviewed. Event role, booth, category, country and website come from the directory.'],
    ['Result',f"{len(customers)} customer prospect entries after grouping four related listings; {len(core)} P1/P2 core prospects and {len(adjacent)} P3 adjacent suppliers."],
    ['Other opportunities',f"{len(partners)} partner entries; {len(ecosystem)} technology ecosystem entries; {len(qualify)} entries needing qualification."],
    ['Meaning of interest','Potential fit is an analyst inference. No company has expressed interest, been contacted or been qualified as a buyer.'],
    ['P1','Clear operational match and recommended first conversations. Rank is a fit judgment, not purchase probability or a company-size estimate.'],
    ['P2','Relevant recurring foodservice product or buying model; validate channel, delivery coverage and decision maker.'],
    ['P3','Equipment, packaging-industry or project suppliers with conditional catalog/RFQ fit. Lower priority than recurring food/consumables.'],
    ['Partner 1 / 2','Introductions, member programs, referrals or awareness. Kept separate from direct customer prospects.'],
    ['Technology ecosystem','Software, marketplaces and payment-adjacent vendors may overlap with Supplify. Integration/referral discussions require competitive qualification.'],
    ['Qualify first','Thin or conflicting profiles. These entries are not included in the customer prospect count.'],
    ['Coverage validation','Fetched company pages of 100, 100, 100 and 20 records, followed by an empty page. All 320 IDs are unique. All 320 detail profiles were read.'],
    ['Evidence limits','Descriptions and categories are exhibitor/organizer claims, not independent business audits. Website links are reproduced as published, not exhaustively tested.'],
    ['Company grouping','AL ABDALLAH / AL ABDALLAH RESTAURANT; EAM-KIRI / ETS. ANTOINE MASSOUD; two I. HAKIM DOWEK entries; SAID SAIFAN / SAIFAN OIL. Both records remain in All 320.'],
    ['Other related brands','Shared ownership or distribution may link other entries. Counts are prospect entries, not a count of distinct legal entities. Coordinate group-level outreach.'],
    ['Unnamed record','One blank company-name field was identified as QOOT from the profile description and qoot.org website; this inference is explicitly labeled.'],
    ['Geography','International exhibitors require qualification of Lebanese distributor, availability and fulfillment. The country column reproduces event data and can contain errors.'],
    ['Contact details','Profiles provide websites but no dependable public direct contacts. Suggested job titles are analyst recommendations, not named verified decision makers. No emails or phone numbers were guessed.'],
    ['Supplify basis','Current repository README: restaurant/supplier ordering marketplace, catalog, customer pricing, inventory/expiry, receiving, invoices, fulfillment/driver tracking, RFQs and branch operations.'],
    ['Pitch - supplier','Give restaurant customers a digital catalog and ordering channel, coordinate fulfillment, and track invoices while growing your foodservice customer base.'],
    ['Pitch - buyer','Bring supplier ordering, receiving, stock and invoices into a clearer workflow across your outlets.'],
    ['ERP discovery','Confirm existing POS/ERP and integration requirements. Do not assume a manufacturer or large distributor wants to replace its accounting/production systems.'],
    ['Ghanem evidence','Odoo customer reference: https://www.odoo.com/ja_JP/customers/ghanem-frozen-foods-20170085'],
]
for row in intro:ws.append(row)
ws.column_dimensions['A'].width=30
ws.column_dimensions['B'].width=120
for row in ws:
    for c in row:c.alignment=Alignment(vertical='top',wrap_text=True)
    ws.row_dimensions[row[0].row].height=48 if row[0].row>2 else 30
    row[0].font=Font(bold=True,color='163E45')
ws.freeze_panes='B3'

COLOR={'P1':'D9EAD3','P2':'EAF2D5','P3':'FFF2CC','Partner 1':'DAEEF3','Partner 2':'EAF4F8','Ecosystem':'E4DFEC','Qualify':'FCE5CD','Related entry':'E7E6E6','Skip for now':'F2F2F2'}
def sheet(title, records, headers=HEADER):
    sh=wb.create_sheet(title)
    sh.append(headers)
    for record in records:sh.append([record.get(h,'') for h in headers])
    sh.freeze_panes='D2'
    sh.auto_filter.ref=sh.dimensions
    sh.sheet_view.showGridLines=False
    for cell in sh[1]:
        cell.fill=PatternFill('solid',fgColor='163E45')
        cell.font=Font(color='FFFFFF',bold=True)
        cell.alignment=Alignment(wrap_text=True,vertical='center')
    sh.row_dimensions[1].height=36
    widths={'Priority':16,'Company':43,'Booth(s)':23,'Opportunity':24,'Segment':25,'What they do':48,'Why Supplify may fit':76,'Ask for':52,'Opening question':72,'Evidence confidence':20,'Country (as listed)':22,'Website (as published)':45,'Directory profile':50,'Category (as listed)':32,'Event role':22,'Research / relationship notes':80,'Checked on':16,'Related listings':44}
    for j,h in enumerate(headers,1):
        sh.column_dimensions[get_column_letter(j)].width=widths[h]
    for row in sh.iter_rows(min_row=2):
        sh.row_dimensions[row[0].row].height=72
        for cell in row:cell.alignment=Alignment(wrap_text=True,vertical='top')
        row[0].fill=PatternFill('solid',fgColor=COLOR.get(row[0].value,'FFFFFF'))
        row[0].font=Font(bold=True)
        for label in ['Website (as published)','Directory profile']:
            c=row[headers.index(label)]
            if c.value and str(c.value).startswith(('https://','http://')):
                c.hyperlink=c.value;c.font=Font(color='0563C1',underline='single')
    sh.print_title_rows='1:1'
    sh.sheet_properties.pageSetUpPr.fitToPage=True
    sh.page_setup.orientation='landscape'
    sh.page_setup.paperSize=sh.PAPERSIZE_A3
    sh.page_setup.fitToWidth=1
    sh.page_setup.fitToHeight=0

sheet('Start with P1',[r for r in customers if r['Priority']=='P1'],HEADER+['Related listings'])
sheet('Core prospects',core,HEADER+['Related listings'])
sheet('Adjacent suppliers',adjacent,HEADER+['Related listings'])
sheet('Partners',partners)
sheet('Technology ecosystem',ecosystem)
sheet('Qualify first',qualify)
sheet('All 320',all_screened)
xlsx=OUT/'Supplify_HORECA_Leads_2026-11-13.xlsx'
wb.save(xlsx)

def esc(s):return str(s).replace('|',' / ').replace('\n',' ')
def md_table(records, include_reason=True):
    lines=['| Company | Booth(s) | Business / fit |','|---|---|---|']
    for r in records:
        name='['+esc(r['Company'])+']('+r['Directory profile']+')'
        lines.append('| '+name+' | '+esc(r['Booth(s)'])+' | '+esc(r['What they do'])+' |')
    return '\n'.join(lines)

report=f'''# Supplify prospects at HORECA Lebanon

Checked {DATE}. Source: [the exact public Jublia directory supplied by the user]({DIRECTORY}).

Reviewed **320 directory entries and 320 public profiles**, including an empty page after the final results. The directory includes exhibitors, sponsors, supporting hotels, associations and other event participants.

The result is **{len(core)} core prospect entries**, **{len(adjacent)} adjacent supplier entries**, **{len(partners)} partnership entries**, **{len(ecosystem)} technology ecosystem entries** and **{len(qualify)} leads needing qualification**. Four related listings are grouped for outreach and remain visible in the full screening CSV. Other entries were not prioritized on current evidence. Counts describe directory/brand entries, not distinct legal entities.

Potential interest is an inference from business fit. No company has confirmed interest or been contacted. The spreadsheet contains the rationale, suggested decision-maker titles, opening question, website, source profile and qualification notes for every entry.

## First conversations: P1 ({counts['P1']})

These have the clearest match to Supplify's supplier ordering or restaurant/hotel procurement workflows. Order reflects a practical fit judgment; budget, buying intent and existing software still need discovery.

{md_table([r for r in customers if r['Priority']=='P1'])}

## Additional core prospects: P2 ({counts['P2']})

{md_table([r for r in customers if r['Priority']=='P2'])}

## Adjacent suppliers: P3 ({len(adjacent)})

These sell equipment, project goods or industrial packaging. Explore repeat catalog products, spares or RFQs first. Supplify fit does not establish a fit for manufacturing, installation or project accounting.

{md_table(adjacent)}

## Partnerships ({len(partners)})

Associations and clusters can introduce groups of suppliers or restaurant buyers. Consultants can introduce operating clients; education, media and adjacent services are lower-priority opportunities. These are not direct customer leads by default.

{md_table(partners)}

## Technology ecosystem ({len(ecosystem)})

Assess integration/referral potential and competitive overlap. POS, ERP, reservations, HR and marketplace vendors should receive a different pitch from suppliers.

{md_table(ecosystem)}

## Qualify before treating as a prospect ({len(qualify)})

These entries have sparse or conflicting profiles. Confirm business activity, B2B channel, location, customer base and identity first.

{md_table(qualify)}

## Source quality and account notes

- The four outreach groups are Al Abdallah's two listings; EAM/Kiri and Ets. Antoine Massoud; I. Hakim Dowek's two listings; and Said Saifan/Saifan Oil. Related brands elsewhere may also share a parent company or distributor.
- QOOT's directory company-name field is blank. Its identification is inferred from its description and qoot.org website.
- Directory categories can be inaccurate: SABCO is tagged technology but describes consumables; TerraFood is tagged interiors but describes egg products; AL JAWAD is tagged food but describes contracting.
- Websites and countries are reproduced as the event publishes them. Conflicts such as MKS, HOME POINT and Nahr Engel are flagged in the spreadsheet. Website ownership, staffing, budget and local fulfillment were not independently audited.
- [Odoo publishes a Ghanem customer reference](https://www.odoo.com/ja_JP/customers/ghanem-frozen-foods-20170085). Discuss digital ordering/marketplace complementarity and integration rather than assuming it needs a replacement ERP.
- All public profiles were read. Several initial detail requests were rate limited; the missing profiles were subsequently retrieved at a slower rate. No authentication barrier was bypassed; the directory explicitly issued a public anonymous visitor session.
- Job titles and outreach angles are recommendations. Direct email/phone contacts were not guessed.

## Suggested opening

Supplier: “Supplify gives restaurant customers a digital catalog and ordering channel and helps you coordinate orders, fulfillment and invoices. How do your restaurant orders arrive today?”

Restaurant/hotel: “Supplify brings supplier ordering, receiving, stock and invoices into a clearer workflow across your outlets. Where does purchasing take the most manual work today?”

Association: “Could we test a small ordering/procurement pilot with a few supplier and restaurant members?”

This is research output only. No application, API, authentication or client behavior was changed.
'''
(OUT/'Supplify_HORECA_Full_Shortlist.md').write_text(report,encoding='utf-8')

check=load_workbook(xlsx,read_only=True,data_only=False)
assert check['All 320'].max_row==321
assert check['Core prospects'].max_row==len(core)+1
assert check['Start with P1'].max_row==counts['P1']+1
assert len({r['Directory profile'] for r in all_screened})==320
assert all(r['Directory profile'].startswith('https://jublia.ai/HORECA-Lebanon/') for r in all_screened)
assert all(r['What they do'] and r['Why Supplify may fit'] for r in customers)
check.close()
print(json.dumps(stats,indent=2))
print('Validated workbook, unique source links, grouping totals and CSV/Markdown outputs.')
for f in OUT.iterdir():
    if f.suffix in {'.xlsx','.csv','.md'}:print(f.name,f.stat().st_size)


/*
 * -------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
/* eslint-disable */

export enum StorageType {
    DRY = "DRY",
    CHILL = "CHILL",
    FREEZE = "FREEZE",
    CHEMICAL = "CHEMICAL"
}

export enum MovementType {
    RECEIPT = "RECEIPT",
    ISSUE = "ISSUE",
    TRANSFER_OUT = "TRANSFER_OUT",
    TRANSFER_IN = "TRANSFER_IN",
    WASTE = "WASTE",
    RETURN = "RETURN",
    ADJUSTMENT = "ADJUSTMENT"
}

export enum BatchStatus {
    OK = "OK",
    HOLD = "HOLD",
    QUARANTINE = "QUARANTINE"
}

export enum CountType {
    CYCLE = "CYCLE",
    FULL = "FULL"
}

export enum CountStatus {
    SCHEDULED = "SCHEDULED",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}

export enum ValuationMethod {
    FIFO = "FIFO",
    WAVG = "WAVG"
}

export interface InventoryItemFilter {
    restaurantId: string;
    active?: Nullable<boolean>;
    categoryId?: Nullable<string>;
    storageType?: Nullable<StorageType>;
    search?: Nullable<string>;
}

export interface Paging {
    offset?: Nullable<number>;
    limit?: Nullable<number>;
}

export interface ReceiveStockInput {
    itemId: string;
    locationId: string;
    qty: number;
    uom: string;
    unitCost: number;
    expiryDate?: Nullable<DateTime>;
    lotCode?: Nullable<string>;
    supplierId?: Nullable<string>;
    refType: string;
    refId?: Nullable<string>;
    causedBy: string;
    reason?: Nullable<string>;
    metadata?: Nullable<JSON>;
    idempotencyKey?: Nullable<string>;
}

export interface IssueStockInput {
    itemId: string;
    locationId: string;
    qty: number;
    uom: string;
    refType: string;
    refId?: Nullable<string>;
    causedBy: string;
    reason?: Nullable<string>;
    allowNegative?: Nullable<boolean>;
    metadata?: Nullable<JSON>;
    idempotencyKey?: Nullable<string>;
}

export interface TransferStockInput {
    itemId: string;
    fromLocationId: string;
    toLocationId: string;
    qty: number;
    uom: string;
    causedBy: string;
    reason?: Nullable<string>;
    metadata?: Nullable<JSON>;
    idempotencyKey?: Nullable<string>;
}

export interface WasteInput {
    itemId: string;
    locationId: string;
    qty: number;
    uom: string;
    causedBy: string;
    reason: string;
    metadata?: Nullable<JSON>;
    idempotencyKey?: Nullable<string>;
}

export interface StartCountInput {
    restaurantId: string;
    locationId: string;
    countType: CountType;
    scheduledFor?: Nullable<DateTime>;
    conductedBy: string;
    notes?: Nullable<string>;
    itemIds?: Nullable<string[]>;
}

export interface SubmitCountLineInput {
    countId: string;
    itemId: string;
    countedQty: number;
    uom: string;
    countedBy: string;
    note?: Nullable<string>;
}

export interface SetParInput {
    itemId: string;
    locationId: string;
    minPar: number;
    maxPar: number;
    reorderPoint: number;
    reorderQty: number;
    safetyStock?: Nullable<number>;
}

export interface RecipeInput {
    restaurantId: string;
    name: string;
    description?: Nullable<string>;
    yieldUom: string;
    yieldQty: number;
    components: RecipeComponentInput[];
}

export interface RecipeComponentInput {
    itemId: string;
    qtyBase: number;
    uomBase: string;
    wastePct?: Nullable<number>;
}

export interface ProduceRecipeInput {
    recipeId: string;
    locationId: string;
    quantity: number;
    causedBy: string;
    notes?: Nullable<string>;
}

export interface Item {
    id: string;
    restaurantId: string;
    name: string;
    categoryId?: Nullable<string>;
    sku?: Nullable<string>;
    barcode?: Nullable<string>;
    allergenFlags: string[];
    storageType: StorageType;
    uomBase: string;
    uomDisplay?: Nullable<string>;
    yieldPct?: Nullable<number>;
    active: boolean;
    stockOnHand: StockOnHand[];
    batches: Batch[];
    supplierLinks: SupplierLink[];
    parConfigs: ParConfig[];
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface StockOnHand {
    id: string;
    itemId: string;
    locationId: string;
    restaurantId: string;
    qtyOnHandBase: number;
    qtyCommittedBase: number;
    qtyAvailableBase: number;
    lastCost?: Nullable<number>;
    avgCost?: Nullable<number>;
    totalValue?: Nullable<number>;
    lastMovementAt?: Nullable<DateTime>;
    item: Item;
    location: Location;
}

export interface Batch {
    id: string;
    itemId: string;
    locationId: string;
    qtyOnHandBase: number;
    expiryDate?: Nullable<DateTime>;
    lotCode?: Nullable<string>;
    supplierId?: Nullable<string>;
    lastUnitCost: number;
    status: BatchStatus;
    item: Item;
    location: Location;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface StockLedger {
    id: string;
    itemId: string;
    restaurantId: string;
    locationId: string;
    batchId?: Nullable<string>;
    movementType: MovementType;
    qtyBase: number;
    uomBase: string;
    unitCost?: Nullable<number>;
    extCost?: Nullable<number>;
    refType?: Nullable<string>;
    refId?: Nullable<string>;
    causedBy: string;
    reason?: Nullable<string>;
    metadata?: Nullable<JSON>;
    timestamp: DateTime;
    item: Item;
    location: Location;
    batch?: Nullable<Batch>;
}

export interface Location {
    id: string;
    restaurantId: string;
    name: string;
    code?: Nullable<string>;
    active: boolean;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface ParConfig {
    id: string;
    itemId: string;
    locationId: string;
    minPar: number;
    maxPar: number;
    reorderPoint: number;
    reorderQty: number;
    safetyStock?: Nullable<number>;
    item: Item;
    location: Location;
}

export interface SupplierLink {
    id: string;
    itemId: string;
    supplierId: string;
    supplierProductId: string;
    vendorUom: string;
    unitsPerVendorUom: number;
    leadTimeDays?: Nullable<number>;
    lastPrice?: Nullable<number>;
    preferred: boolean;
}

export interface Recipe {
    id: string;
    restaurantId: string;
    name: string;
    description?: Nullable<string>;
    yieldUom: string;
    yieldQty: number;
    active: boolean;
    components: RecipeComponent[];
    estimatedCost?: Nullable<number>;
    costPerYield?: Nullable<number>;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface RecipeComponent {
    id: string;
    recipeId: string;
    itemId: string;
    qtyBase: number;
    uomBase: string;
    wastePct?: Nullable<number>;
    item: Item;
}

export interface InventoryCount {
    id: string;
    restaurantId: string;
    locationId: string;
    countType: CountType;
    status: CountStatus;
    scheduledFor?: Nullable<DateTime>;
    startedAt?: Nullable<DateTime>;
    closedAt?: Nullable<DateTime>;
    conductedBy?: Nullable<string>;
    notes?: Nullable<string>;
    location: Location;
    lines: InventoryCountLine[];
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface InventoryCountLine {
    id: string;
    countId: string;
    itemId: string;
    systemQtyBase: number;
    countedQtyBase?: Nullable<number>;
    varianceQtyBase?: Nullable<number>;
    varianceCost?: Nullable<number>;
    note?: Nullable<string>;
    countedBy?: Nullable<string>;
    countedAt?: Nullable<DateTime>;
    item: Item;
}

export interface ValuationReport {
    method: ValuationMethod;
    totalValue: number;
    itemValuations: ItemValuation[];
}

export interface ItemValuation {
    itemId: string;
    itemName: string;
    locationId: string;
    locationName: string;
    qty: number;
    unitCost: number;
    totalCost: number;
}

export interface ReplenishmentSuggestion {
    item: Item;
    location: Location;
    qtyAvailable: number;
    reorderPoint: number;
    reorderQty: number;
    qtyToOrder: number;
    parConfig: ParConfig;
    supplierLinks: SupplierLink[];
}

export interface Alert {
    id: string;
    restaurantId: string;
    alertType: string;
    severity: string;
    itemId?: Nullable<string>;
    locationId?: Nullable<string>;
    batchId?: Nullable<string>;
    message: string;
    metadata?: Nullable<JSON>;
    acknowledged: boolean;
    acknowledgedBy?: Nullable<string>;
    acknowledgedAt?: Nullable<DateTime>;
    createdAt: DateTime;
}

export interface IQuery {
    inventoryItems(filter: InventoryItemFilter, paging?: Nullable<Paging>): Item[] | Promise<Item[]>;
    inventoryItem(id: string): Item | Promise<Item>;
    itemByBarcode(barcode: string, restaurantId: string): Item | Promise<Item>;
    stockOnHand(itemId: string, locationId: string): StockOnHand | Promise<StockOnHand>;
    batches(itemId: string, locationId: string): Batch[] | Promise<Batch[]>;
    ledger(itemId: string, locationId?: Nullable<string>, limit?: Nullable<number>): StockLedger[] | Promise<StockLedger[]>;
    counts(restaurantId: string, status?: Nullable<CountStatus>): InventoryCount[] | Promise<InventoryCount[]>;
    count(id: string): InventoryCount | Promise<InventoryCount>;
    valuation(restaurantId: string, method: ValuationMethod): ValuationReport | Promise<ValuationReport>;
    parSuggestions(restaurantId: string, locationId?: Nullable<string>): ReplenishmentSuggestion[] | Promise<ReplenishmentSuggestion[]>;
    recipes(restaurantId: string, activeOnly?: Nullable<boolean>): Recipe[] | Promise<Recipe[]>;
    recipe(id: string): Recipe | Promise<Recipe>;
    recipeAvailability(recipeId: string, locationId: string): JSON | Promise<JSON>;
    alerts(restaurantId: string, acknowledged?: Nullable<boolean>): Alert[] | Promise<Alert[]>;
}

export interface IMutation {
    receiveStock(input: ReceiveStockInput): JSON | Promise<JSON>;
    issueStock(input: IssueStockInput): JSON | Promise<JSON>;
    transferStock(input: TransferStockInput): JSON | Promise<JSON>;
    recordWaste(input: WasteInput): JSON | Promise<JSON>;
    startCount(input: StartCountInput): JSON | Promise<JSON>;
    submitCountLine(input: SubmitCountLineInput): InventoryCountLine | Promise<InventoryCountLine>;
    finalizeCount(countId: string, conductedBy: string, notes?: Nullable<string>): JSON | Promise<JSON>;
    setParConfig(input: SetParInput): ParConfig | Promise<ParConfig>;
    createRecipe(input: RecipeInput): Recipe | Promise<Recipe>;
    postRecipeProduction(input: ProduceRecipeInput): JSON | Promise<JSON>;
    acknowledgeAlert(id: string, acknowledgedBy: string): Alert | Promise<Alert>;
}

export type DateTime = any;
export type JSON = any;
type Nullable<T> = T | null;

import { promises as fs } from 'fs';
import path from 'path';

// Mock database for campaigns - in real implementation, this would be a database
let campaigns = [
  {
    id: 'cmp_1',
    supplierId: 'sup_1',
    supplierName: 'Fresh Foods Co.',
    type: 'SPONSORED_VISIBILITY',
    name: 'Holiday Visibility Boost',
    description: 'Boost supplier card visibility during holiday season',
    placement: 'SUPPLIER_CARD',
    status: 'PENDING',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    dailyBudgetUSD: 50,
    totalBudgetUSD: 1000,
    spentUSD: 0,
    cpmUSD: 2.5,
    cpcUSD: 0.5,
    targetType: 'SUPPLIER',
    targetIds: ['sup_1'],
    keywords: ['fresh', 'organic', 'local'],
    priorityScore: 1.2,
    approved: false,
    createdBy: 'user_1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'cmp_2',
    supplierId: 'sup_2',
    supplierName: 'Premium Meats Ltd.',
    type: 'DISCOUNT',
    name: 'Winter Sale Campaign',
    description: '20% off premium cuts',
    status: 'PENDING',
    startDate: '2024-02-01',
    endDate: '2024-02-28',
    totalBudgetUSD: 500,
    spentUSD: 0,
    discountType: 'PERCENT',
    discountValue: 20,
    minQty: 5,
    targetType: 'PRODUCT',
    targetIds: ['prod_1', 'prod_2', 'prod_3'],
    keywords: ['meat', 'premium', 'sale'],
    priorityScore: 1.0,
    approved: false,
    createdBy: 'user_2',
    createdAt: '2024-01-20T00:00:00Z',
    updatedAt: '2024-01-20T00:00:00Z',
  },
];

// PERSISTENT STORAGE FOR CAMPAIGNS
const DATA_DIR = path.join(process.cwd(), 'data');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Save campaigns to file
export async function saveCampaigns() {
  await ensureDataDir();
  await fs.writeFile(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
}

// Load campaigns from file
async function loadCampaigns() {
  try {
    await ensureDataDir();
    const campaignsData = await fs.readFile(CAMPAIGNS_FILE, 'utf8');
    campaigns = JSON.parse(campaignsData);
  } catch {
    // File doesn't exist, use default data
  }
}

// Load campaigns on module initialization
loadCampaigns();

// Get campaigns
export function getCampaigns() {
  return campaigns;
}

// Add campaign
export function addCampaign(campaign: any) {
  campaigns.push(campaign);
}

// Update campaign
export function updateCampaign(id: string, updates: any) {
  const index = campaigns.findIndex(c => c.id === id);
  if (index !== -1) {
    campaigns[index] = { ...campaigns[index], ...updates };
    return campaigns[index];
  }
  return null;
}

// Delete campaign
export function deleteCampaign(id: string) {
  const index = campaigns.findIndex(c => c.id === id);
  if (index !== -1) {
    campaigns.splice(index, 1);
    return true;
  }
  return false;
}

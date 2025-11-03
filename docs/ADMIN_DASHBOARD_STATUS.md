# Admin Dashboard System

## Overview
Complete subscription-based admin dashboard system with separate views for suppliers and restaurants.

## Features

### Admin Dashboard (`/app/admin`)
Full admin panel with all features:
- **Overview**: Platform metrics (MRR, ARR, tenants, subscriptions)
- **Plans**: Manage subscription plans
- **Subscriptions**: All tenant subscriptions
- **Tenants**: Supplier & Restaurant directories
- **Features**: Controlled via subscription plan features JSONB
- **Usage**: Usage metrics and quotas
- **Audit Logs**: Admin action history

### Supplier Admin (`/app/admin/suppliers`)
Supplier-focused management:
- **Directory**: Supplier table (products, warehouses, revenue, subscription status)
- **Usage & Quotas**: Product usage metrics, over-limit tracking
- **Audit Logs**: Supplier-specific admin actions

### Restaurant Admin (`/app/admin/restaurants`)
Restaurant-focused management:
- **Directory**: Restaurant table (orders, spending, subscription status)
- **Usage & Quotas**: Order metrics, spending analytics
- **Audit Logs**: Restaurant-specific admin actions

## Technical Details

### Navigation
- Custom sidebar for admins showing only: Admin Dashboard, Supplier Admin, Restaurant Admin, Settings
- Directory tab opens by default on supplier/restaurant admin pages

### Data Loading
- Proper error handling with user-friendly messages
- Loading states with spinners
- Empty state messages
- Debug logging for troubleshooting

### Bug Fixes
- Fixed string concatenation issue in metrics (now uses `parseInt()`)
- Simplified SQL queries to prevent JOIN errors
- JSX syntax fixes with proper fragment wrapping

## Usage

Admins can now efficiently manage:
1. **Suppliers**: Track product counts, warehouses, revenue, subscriptions
2. **Restaurants**: Monitor orders, spending, subscription status
3. **Overall Platform**: View aggregated metrics and manage plans

All data is real-time from the PostgreSQL database with proper subscription enforcement.

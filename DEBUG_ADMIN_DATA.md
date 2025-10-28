# Debug: Admin Dashboard Data Loading

## Issue
Data not showing in Supplier Admin and Restaurant Admin pages

## Root Cause Analysis

### What's Configured ✅
1. **API Endpoints** - Backend routes exist:
   - `/api/admin-dashboard/tenants/suppliers`
   - `/api/admin-dashboard/tenants/restaurants`

2. **React Query Hooks** - Frontend hooks configured:
   - `useGetAdminSuppliersQuery()`
   - `useGetAdminRestaurantsQuery()`

3. **Data Structure** - Properly accessing data:
   - `suppliersData?.suppliers`
   - `restaurantsData?.restaurants`

4. **Queries Loaded** - At component top level (lines 37-38)

### Possible Issues

1. **Backend Not Returning Data**
   - Check if SQL query has issues in `admin-dashboard.routes.js`
   - Verify the JOIN conditions work correctly

2. **Authentication**
   - Endpoints require `requireAuth` and `requireRole(['ADMIN'])`
   - Ensure admin user is logged in

3. **CORS or Network Issues**
   - Check browser console for 401/403 errors
   - Verify API server is running

## Debug Added

Console logging added to verify:
- What data is being received
- Loading states
- Any errors from the API

## Next Steps

1. Open browser console while on Supplier Admin page
2. Check what `AdminDashboard Debug:` logs show
3. If `suppliersError` exists, that's the issue
4. If `suppliersData` is undefined/null, check network tab for API response

## Quick Test

Visit `/app/admin/suppliers` and check browser console and Network tab.


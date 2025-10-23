# 🔐 **Supplify Authentication Guide**

## 📋 **Table of Contents**
1. [Overview](#overview)
2. [Demo User Accounts](#demo-user-accounts)
3. [How to Login](#how-to-login)
4. [Role-Based Access](#role-based-access)
5. [Troubleshooting](#troubleshooting)

---

## 🎯 **Overview**

Supplify uses a role-based authentication system with three user types:
- **Admin** - Platform management
- **Restaurant** - Inventory and order management
- **Supplier** - Product catalog and sales management

---

## 👥 **Demo User Accounts**

### **1. Admin Account**
```
Email: admin@supplify.com
Password: admin123
Role: Admin
```

**Access to:**
- Subscription management
- Feature flags control
- Promotion approvals
- Platform analytics
- Product import reviews

---

### **2. Restaurant Account**
```
Email: restaurant@supplify.com
Password: restaurant123
Role: Restaurant Manager
Organization: Golden Fork Restaurant
```

**Access to:**
- Dashboard (overview)
- Inventory management
- Order placement and tracking
- Supplier directory
- Real-time chat with suppliers
- Invoice management

---

### **3. Supplier Account**
```
Email: supplier@supplify.com
Password: supplier123
Role: Sales Manager
Organization: Fresh Foods Supply
```

**Access to:**
- Dashboard (sales overview)
- Product catalog management
- Order fulfillment
- Sponsored campaigns
- Real-time chat with restaurants
- Analytics and insights

---

## 🚀 **How to Login**

### **Method 1: Manual Login**
1. Navigate to **http://localhost:3000/login**
2. Enter your email address
3. Enter your password
4. Click "Sign In"
5. You'll be redirected to your role-specific dashboard

### **Method 2: Quick Login (Demo Accounts)**
1. Navigate to **http://localhost:3000/login**
2. Click on one of the three demo account cards:
   - **Admin** (Purple card)
   - **Restaurant** (Blue card)
   - **Supplier** (Green card)
3. Credentials will auto-fill
4. Click "Sign In"
5. You'll be redirected to your dashboard

---

## 🔒 **Role-Based Access**

### **What Happens After Login?**

When you successfully log in, you'll be automatically redirected to your role-specific dashboard:

| Role | Redirect URL | Access Level |
|------|--------------|--------------|
| Admin | `/admin/dashboard` | Full platform control |
| Restaurant | `/restaurant/dashboard` | Restaurant features only |
| Supplier | `/supplier/dashboard` | Supplier features only |

---

### **Protected Routes**

All role-specific pages are protected. If you try to access a page without the correct role, you'll see an "Access Denied" message with a link back to the login page.

**Example:**
- A **Supplier** trying to access `/restaurant/inventory` will be denied access
- An **Admin** trying to access `/supplier/products` will be denied access
- A **Restaurant** trying to access `/admin/subscriptions` will be denied access

---

## 🔄 **Switching Roles**

You can switch between roles without logging out:

1. Click on your **user avatar** in the top-right corner
2. Select "Switch to [Role]" from the dropdown menu
3. You'll be redirected to the new role's dashboard

**Available switches:**
- Switch to Admin
- Switch to Restaurant
- Switch to Supplier

---

## 🛠️ **Troubleshooting**

### **Problem: "Access Denied" on every page**

**Solution:**
1. Make sure you're logged in with the correct credentials
2. Clear your browser's localStorage:
   - Open Developer Tools (F12)
   - Go to Application tab → Local Storage
   - Find `supplify-user` key and delete it
   - Refresh the page and login again

---

### **Problem: Login button doesn't work**

**Solution:**
1. Check the browser console for errors (F12)
2. Make sure the frontend server is running on port 3000
3. Try refreshing the page
4. Clear browser cache and try again

---

### **Problem: Redirects to wrong dashboard**

**Solution:**
1. Logout completely
2. Clear localStorage (see above)
3. Login again with the correct credentials
4. The role is determined by the email you use to login

---

### **Problem: Pages keep showing "Loading..."**

**Solution:**
1. Check if localStorage has your user data:
   - Open Developer Tools (F12)
   - Application tab → Local Storage
   - Look for `supplify-user` key
2. If missing, login again
3. If present but still loading, clear it and login again

---

## 📱 **User Interface Elements**

### **Navigation Bar**
- Dynamic menu items based on your role
- User profile dropdown (top-right)
- Logout option

### **User Menu**
Click your avatar to see:
- Current user name and email
- Current role and organization
- Switch role options
- Settings
- Logout

---

## 🎨 **Visual Indicators**

### **Role Colors**
- **Admin** → Purple theme 🟣
- **Restaurant** → Blue theme 🔵
- **Supplier** → Green theme 🟢

### **Status Indicators**
- Logged in → User avatar visible
- Not logged in → Redirected to login page
- Wrong role → "Access Denied" message

---

## 📊 **Session Management**

### **Session Persistence**
- Your session is stored in browser localStorage
- Stays logged in even after browser refresh
- Persists until you explicitly logout

### **Logout**
1. Click your user avatar (top-right)
2. Click "Logout"
3. You'll be redirected to the login page
4. Session data is cleared from localStorage

---

## 🔐 **Security Notes**

### **Important:**
- This is a **demo authentication system**
- Passwords are stored in the frontend code
- Not suitable for production use
- For development and testing purposes only

### **Production Considerations:**
- Implement proper backend authentication
- Use secure password hashing
- Add JWT tokens or session management
- Implement HTTPS
- Add CSRF protection
- Add rate limiting for login attempts

---

## 📝 **Quick Reference**

### **All Demo Accounts**
| Email | Password | Role |
|-------|----------|------|
| admin@supplify.com | admin123 | Admin |
| restaurant@supplify.com | restaurant123 | Restaurant |
| supplier@supplify.com | supplier123 | Supplier |

---

## 🎯 **Testing Checklist**

- [ ] Login with admin account
- [ ] Access admin dashboard
- [ ] Switch to restaurant role
- [ ] Access restaurant pages (inventory, orders, etc.)
- [ ] Switch to supplier role
- [ ] Access supplier pages (products, campaigns, etc.)
- [ ] Try accessing wrong role's pages (should deny)
- [ ] Logout and login with different account
- [ ] Verify session persists after page refresh

---

## 🆘 **Need Help?**

If you encounter any issues:
1. Check the browser console for errors
2. Verify the frontend is running on port 3000
3. Clear browser cache and localStorage
4. Try a different browser
5. Restart the frontend server

---

## 🎉 **Success Criteria**

You've successfully implemented authentication when:
- ✅ You can login with all three demo accounts
- ✅ Each role redirects to the correct dashboard
- ✅ You can access all pages for your role
- ✅ You're blocked from accessing other roles' pages
- ✅ You can switch roles using the user menu
- ✅ Session persists after page refresh
- ✅ Logout clears your session properly

---

**🔥 Your authentication system is now fully functional!**


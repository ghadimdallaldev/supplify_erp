# Getting Started with Supplify

This guide will help you get Supplify up and running quickly.

## 🚀 Quick Start (Recommended)

### Option 1: One-Command Setup
```bash
# Windows (PowerShell)
.\start-platform.ps1

# Linux/macOS (Bash)
./start-platform.sh
```

### Option 2: Manual Setup
```bash
# Install dependencies
npm install

# Start the platform
npm run dev
```

## 📋 Prerequisites

- **Node.js** 18 or higher
- **npm** or **pnpm** package manager
- **Git** for version control
- **Windows 10/11** or **macOS/Linux**

## 🔧 Installation Steps

### 1. Clone the Repository
```bash
git clone <repository-url>
cd supplify-core
```

### 2. Install Dependencies
```bash
# Using npm
npm install

# Using pnpm (recommended)
pnpm install

# Using yarn
yarn install
```

### 3. Start the Platform
```bash
# Start all services
npm run dev

# Or use the startup script
.\start-platform.ps1  # Windows
./start-platform.sh   # Linux/macOS
```

## 🌐 Accessing the Application

Once started, you can access:

- **Main Application**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin/dashboard
- **Test Data Manager**: http://localhost:3000/admin/test-data

## 👥 Default Accounts

### Admin Account
- **Email**: `admin@supplify.com`
- **Password**: `admin123`
- **Access**: Full platform access, user management, feature flags

### Demo Accounts (After Test Data Initialization)
All test accounts use password: `password123`

#### Restaurants
- `restaurant1@example.com` - Golden Fork Restaurant
- `restaurant2@example.com` - Bella Vista Bistro
- `restaurant3@example.com` - Downtown Bistro
- `restaurant4@example.com` - Mama Mia Italian
- `restaurant5@example.com` - Sunset Grill

#### Suppliers
- `supplier1@example.com` - Fresh Foods Co.
- `supplier2@example.com` - Premium Meats Ltd.
- `supplier3@example.com` - Ocean Fresh Seafood
- `supplier4@example.com` - Garden Valley Organics
- `supplier5@example.com` - Artisan Bakery Supply

## 🧪 Setting Up Test Data

1. **Login as admin** using the admin account above
2. **Navigate to** `/admin/test-data`
3. **Click "Initialize Test Data"** to create:
   - 5 restaurant accounts
   - 5 supplier accounts
   - 25 relationships (each restaurant ↔ each supplier)
   - 25 chat threads with sample messages

## 🎯 First Steps

### For Admins
1. Go to `/admin/dashboard` to see the overview
2. Visit `/admin/users` to manage user accounts
3. Check `/admin/feature-flags` to toggle features
4. Use `/admin/test-data` to manage test accounts

### For Restaurants
1. Login with a restaurant account
2. Go to `/restaurant/dashboard` to see your suppliers
3. Visit `/restaurant/chat` to communicate with suppliers
4. Check `/restaurant/orders` to manage orders

### For Suppliers
1. Login with a supplier account
2. Go to `/supplier/dashboard` to see your restaurant clients
3. Visit `/supplier/chat` to communicate with restaurants
4. Check `/supplier/products` to manage your catalog

## 🔧 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Kill processes on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use the stop script
.\stop-platform.ps1  # Windows
./stop-platform.sh   # Linux/macOS
```

#### Node.js Processes Not Stopping
```bash
# Kill all Node.js processes
taskkill /F /IM node.exe  # Windows
pkill -f node            # Linux/macOS
```

#### Dependencies Issues
```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules
npm install
```

### Getting Help

1. **Check the logs** in the `logs/` directory
2. **Review error messages** in the browser console
3. **Check the troubleshooting guide** in the documentation
4. **Create an issue** in the repository

## 🚀 Next Steps

Once you have Supplify running:

1. **Explore the features** using the test accounts
2. **Read the user guides** for detailed instructions
3. **Check the API documentation** for integration
4. **Review the architecture** to understand the system
5. **Set up your own data** by creating real accounts

## 📚 Additional Resources

- [Architecture Overview](../ARCHITECTURE.md)
- [Authentication Guide](./authentication.md)
- [Chat System Guide](./chat.md)
- [Feature Flags Guide](./feature-flags.md)
- [API Documentation](../api/)

Happy coding! 🎉

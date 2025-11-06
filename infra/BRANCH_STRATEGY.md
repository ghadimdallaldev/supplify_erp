# Branch Strategy & CI/CD Flow

## 📋 Branch Structure

You need these branches on GitHub:

- **`dev`** - Development branch → deploys to **dev environment**
- **`staging`** - Staging branch → deploys to **staging environment**
- **`main`** - Production branch → deploys to **prod environment** (with approval)

## 🔄 Typical Workflow

```
Feature Branch → dev → staging → main
                  ↓       ↓        ↓
               Dev Env  Staging  Prod
```

### Development Flow

1. **Create feature branch** from `dev`:

   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/my-feature
   ```

2. **Merge to `dev`** → Auto-deploys to dev environment

   ```bash
   git checkout dev
   git merge feature/my-feature
   git push origin dev
   # GitHub Actions automatically deploys to dev
   ```

3. **Merge `dev` to `staging`** → Auto-deploys to staging environment

   ```bash
   git checkout staging
   git pull origin staging
   git merge dev
   git push origin staging
   # GitHub Actions automatically deploys to staging
   ```

4. **Merge `staging` to `main`** → Auto-deploys to prod (with approval)
   ```bash
   git checkout main
   git pull origin main
   git merge staging
   git push origin main
   # GitHub Actions deploys to prod (requires manual approval)
   ```

## 🚀 Creating Branches

If you don't have these branches yet:

### Option 1: Create from main (recommended)

```bash
# Create dev branch
git checkout main
git checkout -b dev
git push origin dev

# Create staging branch
git checkout main
git checkout -b staging
git push origin staging
```

### Option 2: Create from current branch

```bash
# Create dev branch
git checkout -b dev
git push origin dev

# Create staging branch
git checkout -b staging
git push origin staging
```

## 🔧 Workflow Configuration

### Dev Environment (deploy-dev.yml)

- **Trigger**: Push to `dev` branch
- **Auto-deploy**: Yes (no approval needed)
- **Environment**: `dev`

### Staging Environment (deploy-staging.yml)

- **Trigger**: Push to `staging` branch
- **Auto-deploy**: Yes (no approval needed)
- **Environment**: `staging`

### Production Environment (deploy-prod.yml)

- **Trigger**: Push to `main` branch OR tags matching `v*.*.*`
- **Auto-deploy**: Yes, but requires **manual approval** in GitHub Actions
- **Environment**: `production`

## ✅ Verification

After creating branches, verify they exist:

```bash
git branch -a
```

You should see:

- `dev`
- `staging`
- `main` (or `master`)

## 🔐 GitHub Secrets Required

Add these secrets to **all environments** (dev, staging, production):

- `AWS_ACCOUNT_ID` - Your AWS account ID
- `AWS_REGION` - AWS region (default: `me-south-1`)
- `AWS_ROLE_ARN_DEV` - Deploy role ARN for dev
- `AWS_ROLE_ARN_STAGING` - Deploy role ARN for staging
- `AWS_ROLE_ARN_PROD` - Deploy role ARN for prod

## 📝 Alternative: Deploy from main to all environments

If you prefer to deploy from `main` to different environments based on manual triggers or tags:

1. Update workflows to trigger on `main` branch
2. Use workflow inputs or environment variables to select environment
3. Use `workflow_dispatch` for manual deployments

Example workflow trigger:

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        type: choice
        options:
          - dev
          - staging
          - prod
```

## 🎯 Best Practices

1. **Always test in dev first** before staging
2. **Use staging for final validation** before production
3. **Require approval for production** deployments
4. **Tag releases** on main branch (e.g., `v1.0.0`)
5. **Keep branches in sync** by merging up the chain

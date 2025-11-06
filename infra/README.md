# Supplify AWS Infrastructure

Multi-environment AWS infrastructure for Supplify SaaS platform using AWS CDK v2 (TypeScript).

## 🏗️ Architecture

Each environment (`dev`, `staging`, `prod`) has isolated infrastructure:

- **VpcStack** - VPC with 2 public + 2 private subnets, NAT gateways
- **DbStack** - Aurora PostgreSQL Serverless v2 (Multi-AZ, auto-pause off)
- **S3Stack** - S3 bucket for file uploads
- **EcsStack** - ECS Fargate cluster with API service + ALB
- **S3CloudFrontStack** - Frontend (S3 + CloudFront + WAF + HTTPS)
- **ObservabilityStack** - CloudWatch Logs + Metrics + Dashboards + X-Ray
- **IAMStack** - OIDC provider + deployment roles (per environment)

## 📋 Prerequisites

- **Node.js**: Version 20+
- **pnpm**: Version 8+
- **AWS Account**: Configured via environment variables or CDK context
- **AWS CDK CLI**: Installed via `pnpm install` (included in dependencies)

## ⚙️ Configuration

### Environment Variables

Set these before deploying:

```bash
export AWS_ACCOUNT_ID=your-account-id
export AWS_REGION=me-south-1
export GITHUB_REPO=your-username/repo-name
```

Or use CDK context:

```bash
npx cdk deploy --context account=your-account-id --context region=me-south-1
```

### Environment Configuration

| Environment | Branch    | Min Capacity | Max Capacity | Desired Count | NAT Gateways |
| ----------- | --------- | ------------ | ------------ | ------------- | ------------ |
| **dev**     | `dev`     | 0.5 ACU      | 2 ACU        | 1 task        | 1            |
| **staging** | `staging` | 0.5 ACU      | 4 ACU        | 2 tasks       | 1            |
| **prod**    | `main`    | 1 ACU        | 16 ACU       | 2 tasks       | 2            |

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd infra
pnpm install
```

### 2. Bootstrap CDK (First Time Only)

```bash
# Set AWS credentials first
export AWS_ACCOUNT_ID=your-account-id
export AWS_REGION=me-south-1

# Bootstrap
pnpm cdk:bootstrap
```

### 3. Deploy Infrastructure

#### Deploy to Dev

```bash
pnpm deploy:dev
# or
npx cdk deploy --all --context env=dev
```

#### Deploy to Staging

```bash
pnpm deploy:staging
# or
npx cdk deploy --all --context env=staging
```

#### Deploy to Production

```bash
pnpm deploy:prod
# or
npx cdk deploy --all --context env=prod
```

## 🔄 CI/CD Pipeline

### GitHub Actions (Automatic Deployment)

**Branch → Environment Mapping:**

- `dev` branch → dev environment (auto-deploy)
- `staging` branch → staging environment (auto-deploy)
- `main` branch → production environment (auto-deploy with approval)

**Workflows:**

- `.github/workflows/deploy-dev.yml` - Deploys on push to `dev` branch
- `.github/workflows/deploy-staging.yml` - Deploys on push to `staging` branch
- `.github/workflows/deploy-prod.yml` - Deploys on push to `main` branch (with approval)
- `.github/workflows/infra-deploy.yml` - Manual infrastructure-only deployment

### ⚠️ Important: Create Branches First

You need to create `dev` and `staging` branches on GitHub:

```bash
# Create dev branch
git checkout -b dev
git push origin dev

# Create staging branch
git checkout -b staging
git push origin staging
```

See `BRANCH_STRATEGY.md` for detailed branch workflow.

### Setup GitHub Actions

1. **Deploy IAM Stack first** (creates roles):

   ```bash
   npx cdk deploy Supplify-IAMStack-dev --context env=dev
   ```

2. **Get role ARNs from outputs**:

   ```bash
   aws cloudformation describe-stacks \
     --stack-name Supplify-IAMStack-dev \
     --query 'Stacks[0].Outputs' \
     --output table
   ```

3. **Add GitHub Secrets**:
   - `AWS_ROLE_ARN_DEV` = Deploy Role ARN for dev
   - `AWS_ROLE_ARN_STAGING` = Deploy Role ARN for staging
   - `AWS_ROLE_ARN_PROD` = Deploy Role ARN for prod

4. **Push to branch** - GitHub Actions will automatically deploy!

## 📦 Available Scripts

```bash
# Development
pnpm synth:dev          # Synthesize dev environment
pnpm synth:staging      # Synthesize staging environment
pnpm synth:prod         # Synthesize production environment

# Deployment
pnpm deploy:dev         # Deploy dev environment
pnpm deploy:staging     # Deploy staging environment
pnpm deploy:prod        # Deploy production environment

# Cleanup
pnpm destroy:dev        # Destroy dev environment
pnpm destroy:staging     # Destroy staging environment
pnpm destroy:prod        # Destroy production environment

# CDK Utilities
pnpm cdk:bootstrap       # Bootstrap CDK
pnpm cdk:synth          # Synthesize all stacks
pnpm cdk:deploy         # Deploy all stacks
```

## 🔍 Outputs

After deployment, get outputs from CloudFormation:

```bash
# Get API URL
aws cloudformation describe-stacks \
  --stack-name Supplify-EcsStack-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text

# Get Database Endpoint
aws cloudformation describe-stacks \
  --stack-name Supplify-DbStack-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text

# Get S3 Bucket Name
aws cloudformation describe-stacks \
  --stack-name Supplify-S3Stack-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text
```

## 🔐 Security

- All resources tagged with `Project=Supplify`, `Environment={env}`, `ManagedBy=Cursor`
- Database in private subnets (not publicly accessible)
- ECS tasks in private subnets
- ALB in public subnets with security groups
- Secrets stored in AWS Secrets Manager
- All data encrypted at rest
- WAF enabled for production CloudFront

## 📊 Observability

- **CloudWatch Logs**: `/supplify/api/{env}` (1 month retention for prod, 1 week for others)
- **CloudWatch Dashboard**: `Supplify-{env}` (available in stack outputs)
- **X-Ray**: Enabled for tracing (10% sampling for prod, 50% for dev/staging)
- **Alarms**: CPU > 80%, ALB 5xx errors, Database connections > 90%

## 🔧 Troubleshooting

### Deployment Fails

1. Check CloudFormation stack events in AWS Console
2. Review CloudWatch logs
3. Verify IAM permissions
4. Check resource limits

### ECS Service Not Starting

1. Check ECS task logs in CloudWatch
2. Verify security groups allow traffic
3. Check database connectivity
4. Verify secrets are accessible

### GitHub Actions Fails

1. Verify OIDC provider exists in AWS IAM
2. Check IAM role trust policy matches repository
3. Verify GitHub secrets are set correctly
4. Check role has correct permissions

## 📚 Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [CDK TypeScript API Reference](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html)

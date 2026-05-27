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
- **IAMStack** - CDK deploy role + AI read-only role (per environment)

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

## 🔄 Deployment (AWS CDK)

Deploy from your machine or a future CI pipeline using the CDK CLI:

1. **Bootstrap** (once per account/region): `pnpm cdk:bootstrap`
2. **Deploy IAM stack** (creates deploy + AI access roles):

   ```bash
   npx cdk deploy Supplify-IAMStack-dev --context env=dev
   ```

3. **Deploy all stacks** for an environment:

   ```bash
   pnpm deploy:dev
   # or
   npx cdk deploy --all --context env=dev
   ```

See `docs/BRANCHING.md` for `dev` / `preprod` / `prod` branch promotion. EC2 Docker deploy scripts under `deploy/scripts/` remain available for VM-based hosting.

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

### CDK Deploy Fails

1. Verify AWS credentials and `cdk bootstrap` for the target account/region
2. Check IAM deploy role permissions (`SupplifyDeployRole_<env>`)
3. Review CloudFormation stack events for the failing resource

## 📚 Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [CDK TypeScript API Reference](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html)

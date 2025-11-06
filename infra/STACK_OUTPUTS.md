# Stack Outputs Reference

## IAM Stack Outputs

### Dev Environment (Supplify-IAMStack-dev)

- **DeployRoleArn**: `arn:aws:iam::<account-id>:role/SupplifyDeployRole_dev`
  - **Use**: Add to GitHub Secrets as `AWS_ROLE_ARN_DEV`
  - **Description**: Role for GitHub Actions to deploy dev environment

- **AIAccessRoleArn**: `arn:aws:iam::<account-id>:role/SupplifyAIAccessRole_dev`
  - **Use**: For Cursor AI read-only access to dev resources
  - **Description**: Read-only role for AI monitoring

- **OidcProviderArn**: `arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com`
  - **Use**: Shared across all environments (created once in dev)
  - **Description**: OIDC provider for GitHub Actions

### Staging Environment (Supplify-IAMStack-staging)

- **DeployRoleArn**: `arn:aws:iam::<account-id>:role/SupplifyDeployRole_staging`
  - **Use**: Add to GitHub Secrets as `AWS_ROLE_ARN_STAGING`

- **AIAccessRoleArn**: `arn:aws:iam::<account-id>:role/SupplifyAIAccessRole_staging`
  - **Use**: For Cursor AI read-only access to staging resources

### Prod Environment (Supplify-IAMStack-prod)

- **DeployRoleArn**: `arn:aws:iam::<account-id>:role/SupplifyDeployRole_prod`
  - **Use**: Add to GitHub Secrets as `AWS_ROLE_ARN_PROD`

- **AIAccessRoleArn**: `arn:aws:iam::<account-id>:role/SupplifyAIAccessRole_prod`
  - **Use**: For Cursor AI read-only access to prod resources

## VPC Stack Outputs

- **VpcId**: VPC ID
- **PublicSubnetIds**: Comma-separated public subnet IDs
- **PrivateSubnetIds**: Comma-separated private subnet IDs

## Database Stack Outputs

- **DatabaseEndpoint**: Aurora PostgreSQL cluster endpoint (e.g., `supplify-dev.cluster-xxxxx.me-south-1.rds.amazonaws.com`)
- **DatabaseSecretArn**: ARN of the secret in Secrets Manager containing database credentials
- **DatabasePort**: Database port (default: 5432)

## S3 Stack Outputs

- **S3BucketName**: S3 bucket name for file uploads (e.g., `supplify-files-dev-<account-id>-<region>`)
- **S3BucketArn**: S3 bucket ARN
- **S3BucketDomainName**: S3 bucket domain name

## ECS Stack Outputs

- **ClusterName**: ECS cluster name (e.g., `supplify-cluster-dev`)
- **ServiceName**: ECS service name (e.g., `supplify-api-dev`)
- **AlbDnsName**: Application Load Balancer DNS name (e.g., `supplify-alb-dev-xxxxx.me-south-1.elb.amazonaws.com`)

## S3 CloudFront Stack Outputs

- **CloudFrontDistributionId**: CloudFront distribution ID
- **CloudFrontDomainName**: CloudFront distribution domain name (e.g., `d1234567890.cloudfront.net`)
- **StaticAssetsBucketName**: S3 bucket name for static assets
- **WebACLId**: WAF Web ACL ID (if WAF is enabled)

## Observability Stack Outputs

- **LogGroupName**: CloudWatch Log Group name (e.g., `/supplify/api/dev`)
- **AlarmTopicArn**: SNS Topic ARN for alarms
- **DashboardUrl**: CloudWatch Dashboard URL

## How to Get Outputs

### Via AWS CLI

```bash
# Get all outputs from a stack
aws cloudformation describe-stacks \
  --stack-name Supplify-IAMStack-dev \
  --query 'Stacks[0].Outputs' \
  --output table

# Get specific output
aws cloudformation describe-stacks \
  --stack-name Supplify-IAMStack-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`DeployRoleArn`].OutputValue' \
  --output text
```

### Via AWS Console

1. Go to CloudFormation → Stacks
2. Select the stack (e.g., `Supplify-IAMStack-dev`)
3. Click "Outputs" tab
4. View all outputs

### Via CDK

```bash
# After deployment, outputs are shown in the terminal
# Or use:
npx cdk list --context env=dev
```

## GitHub Secrets Required

Add these secrets to GitHub repository:

- `AWS_ACCOUNT_ID` - Your AWS account ID
- `AWS_REGION` - AWS region (default: `me-south-1`)
- `AWS_ROLE_ARN_DEV` - Deploy role ARN from IAM stack (dev)
- `AWS_ROLE_ARN_STAGING` - Deploy role ARN from IAM stack (staging)
- `AWS_ROLE_ARN_PROD` - Deploy role ARN from IAM stack (prod)

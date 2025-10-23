# Deployment Guide

This guide covers deploying Supplify to AWS using Terraform and GitHub Actions.

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured
- Terraform >= 1.0
- Docker
- GitHub repository with secrets configured

## AWS Setup

### 1. Configure AWS Credentials

```bash
aws configure
```

### 2. Create S3 Bucket for Terraform State

```bash
aws s3 mb s3://supplify-terraform-state --region eu-central-1
aws s3api put-bucket-versioning \
  --bucket supplify-terraform-state \
  --versioning-configuration Status=Enabled
```

### 3. Create ECR Repositories

```bash
# Create repositories for each service
aws ecr create-repository --repository-name supplify-api-gateway
aws ecr create-repository --repository-name supplify-catalog
aws ecr create-repository --repository-name supplify-orders
aws ecr create-repository --repository-name supplify-restaurants
aws ecr create-repository --repository-name supplify-suppliers
aws ecr create-repository --repository-name supplify-loyalty
aws ecr create-repository --repository-name supplify-notifications
aws ecr create-repository --repository-name supplify-analytics
aws ecr create-repository --repository-name supplify-recommendations
aws ecr create-repository --repository-name supplify-auth-proxy
aws ecr create-repository --repository-name supplify-web
```

## Terraform Deployment

### 1. Initialize Terraform

```bash
cd infra/terraform
terraform init
```

### 2. Plan Infrastructure

```bash
terraform plan -out=tfplan
```

### 3. Apply Infrastructure

```bash
terraform apply tfplan
```

### 4. Get Outputs

```bash
terraform output -json > outputs.json
```

## Database Migrations

### 1. Set Database URL

```bash
export DATABASE_URL="postgresql://supplify:password@<rds-endpoint>:5432/supplify"
```

### 2. Run Migrations

```bash
# For each service with Prisma
cd services/catalog
pnpm prisma migrate deploy

cd ../orders
pnpm prisma migrate deploy

cd ../restaurants
pnpm prisma migrate deploy

cd ../suppliers
pnpm prisma migrate deploy

cd ../loyalty
pnpm prisma migrate deploy

cd ../analytics
pnpm prisma migrate deploy

cd ../auth-proxy
pnpm prisma migrate deploy
```

### 3. Seed Database

```bash
cd services/catalog
pnpm db:seed
```

## GitHub Actions Secrets

Configure the following secrets in your GitHub repository:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `SENDGRID_API_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `RABBITMQ_URL`

## Docker Build & Push

### 1. Login to ECR

```bash
aws ecr get-login-password --region eu-central-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-central-1.amazonaws.com
```

### 2. Build Images

```bash
# Example for catalog service
docker build -t supplify-catalog:latest -f services/catalog/Dockerfile .
```

### 3. Tag Images

```bash
docker tag supplify-catalog:latest \
  <account-id>.dkr.ecr.eu-central-1.amazonaws.com/supplify-catalog:latest
```

### 4. Push Images

```bash
docker push <account-id>.dkr.ecr.eu-central-1.amazonaws.com/supplify-catalog:latest
```

## ECS Deployment

### 1. Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name supplify-cluster
```

### 2. Create Task Definitions

Create task definitions for each service. Example for catalog:

```json
{
  "family": "supplify-catalog",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "catalog",
      "image": "<account-id>.dkr.ecr.eu-central-1.amazonaws.com/supplify-catalog:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:..."
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/supplify-catalog",
          "awslogs-region": "eu-central-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 3. Create Services

```bash
aws ecs create-service \
  --cluster supplify-cluster \
  --service-name catalog \
  --task-definition supplify-catalog \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

## Monitoring

### Prometheus

Access Prometheus at: `http://localhost:9090` (or configured endpoint)

### CloudWatch Logs

All services log to CloudWatch Logs:
- Log group: `/ecs/supplify-<service-name>`

### CloudWatch Metrics

Monitor ECS metrics:
- CPU Utilization
- Memory Utilization
- Request counts
- Error rates

## Health Checks

Each service exposes a health endpoint:
- `GET /health`

Configure ALB health checks:
- Path: `/health`
- Interval: 30 seconds
- Timeout: 5 seconds
- Healthy threshold: 2
- Unhealthy threshold: 3

## Rollback

To rollback a deployment:

```bash
aws ecs update-service \
  --cluster supplify-cluster \
  --service catalog \
  --task-definition supplify-catalog:previous-version \
  --force-new-deployment
```

## Scaling

### Auto Scaling

Configure auto-scaling based on CPU/Memory:

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/supplify-cluster/catalog \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10
```

## Backup

### Database Backups

RDS automated backups are configured:
- Retention period: 7 days
- Backup window: 03:00-04:00 UTC

### Manual Snapshot

```bash
aws rds create-db-snapshot \
  --db-instance-identifier supplify-db \
  --db-snapshot-identifier supplify-snapshot-$(date +%Y%m%d-%H%M%S)
```

## Disaster Recovery

1. **Database**: Restore from RDS snapshot
2. **Code**: Redeploy from GitHub
3. **Infrastructure**: Rerun Terraform

## Cost Optimization

- Use Fargate Spot for non-critical services
- Enable S3 Intelligent-Tiering
- Set up CloudWatch alarms for cost thresholds
- Use Reserved Instances for predictable workloads

## Security

- All traffic over HTTPS
- VPC with private subnets for databases
- Security groups with minimal access
- IAM roles with least privilege
- Secrets in AWS Secrets Manager
- Regular security updates

## Troubleshooting

### Service Won't Start

1. Check CloudWatch Logs
2. Verify environment variables
3. Check database connectivity
4. Verify security groups

### High Error Rates

1. Check application logs
2. Monitor database connections
3. Check RabbitMQ queue depths
4. Verify external API availability

### Performance Issues

1. Check CPU/Memory metrics
2. Analyze slow query logs
3. Review Redis cache hit rates
4. Check RabbitMQ message rates

## Support

For deployment issues:
1. Check CloudWatch Logs
2. Review GitHub Actions logs
3. Consult Terraform state
4. Contact DevOps team


#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { VpcStack } from '../lib/vpc-stack'
import { DbStack } from '../lib/db-stack'
import { S3Stack } from '../lib/s3-stack'
import { EcsStack } from '../lib/ecs-stack'
import { S3CloudFrontStack } from '../lib/s3-cloudfront-stack'
import { ObservabilityStack } from '../lib/observability-stack'
import { IAMStack } from '../lib/iam-stack'

const app = new cdk.App()

// Constants - Load from environment variables or use defaults
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT || ''
const AWS_REGION = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'me-south-1'
const PROJECT_NAME = 'Supplify'
// Environment configurations
const ENVIRONMENTS = {
  dev: {
    branch: 'dev',
    minCapacity: 0.5,
    maxCapacity: 2,
    desiredCount: 1,
  },
  staging: {
    branch: 'staging',
    minCapacity: 0.5,
    maxCapacity: 4,
    desiredCount: 2,
  },
  prod: {
    branch: 'main',
    minCapacity: 1,
    maxCapacity: 16,
    desiredCount: 2,
  },
}

// Environment context (from CLI: --context env=dev|staging|prod)
const envName = app.node.tryGetContext('env') || 'dev'
const environment = ENVIRONMENTS[envName as keyof typeof ENVIRONMENTS] || ENVIRONMENTS.dev

// AWS Environment
const awsEnv = {
  account: AWS_ACCOUNT_ID,
  region: AWS_REGION,
}

// Helper function to create environment-specific resource name
const resourceName = (baseName: string) => `${baseName}-${envName}`

// IAM Stack (must be created first for roles)
// - Deploy Role for CDK CLI / pipeline (per environment)
// - AI Access Role for Cursor AI (per environment)
const iamStack = new IAMStack(app, `${PROJECT_NAME}-IAMStack-${envName}`, {
  env: awsEnv,
  environment: envName,
  projectName: PROJECT_NAME,
})

// VPC Stack
const vpcStack = new VpcStack(app, `${PROJECT_NAME}-VpcStack-${envName}`, {
  env: awsEnv,
  environment: envName,
  projectName: PROJECT_NAME,
})

// Database Stack
const dbStack = new DbStack(app, `${PROJECT_NAME}-DbStack-${envName}`, {
  env: awsEnv,
  environment: envName,
  projectName: PROJECT_NAME,
  vpc: vpcStack.vpc,
  privateSubnets: vpcStack.privateSubnets,
  minCapacity: environment.minCapacity,
  maxCapacity: environment.maxCapacity,
})

// S3 Stack (for file uploads)
const s3Stack = new S3Stack(app, `${PROJECT_NAME}-S3Stack-${envName}`, {
  env: awsEnv,
  environment: envName,
  projectName: PROJECT_NAME,
})

// Observability Stack
const observabilityStack = new ObservabilityStack(
  app,
  `${PROJECT_NAME}-ObservabilityStack-${envName}`,
  {
    env: awsEnv,
    environment: envName,
    projectName: PROJECT_NAME,
  }
)

// ECS Stack
const ecsStack = new EcsStack(app, `${PROJECT_NAME}-EcsStack-${envName}`, {
  env: awsEnv,
  environment: envName,
  projectName: PROJECT_NAME,
  vpc: vpcStack.vpc,
  publicSubnets: vpcStack.publicSubnets,
  privateSubnets: vpcStack.privateSubnets,
  databaseSecret: dbStack.databaseSecret,
  databaseEndpoint: dbStack.databaseEndpoint,
  s3Bucket: s3Stack.bucket,
  desiredCount: environment.desiredCount,
  minCapacity: environment.minCapacity,
  maxCapacity: environment.maxCapacity,
  aiAccessRole: iamStack.aiAccessRole,
  logGroup: observabilityStack.logGroup,
})

// S3 + CloudFront Stack (for frontend)
const s3CloudFrontStack = new S3CloudFrontStack(
  app,
  `${PROJECT_NAME}-S3CloudFrontStack-${envName}`,
  {
    env: awsEnv,
    environment: envName,
    projectName: PROJECT_NAME,
  }
)

// Outputs
new cdk.CfnOutput(ecsStack, `ApiUrl-${envName}`, {
  value: `http://${ecsStack.alb.loadBalancerDnsName}`,
  description: `API URL for ${envName} environment`,
  exportName: `${PROJECT_NAME}-ApiUrl-${envName}`,
})

new cdk.CfnOutput(iamStack, `DeployRoleArn-${envName}`, {
  value: iamStack.deployRole.roleArn,
  description: `Deploy role ARN for ${envName} environment`,
  exportName: `${PROJECT_NAME}-DeployRoleArn-${envName}`,
})

new cdk.CfnOutput(iamStack, `AIAccessRoleArn-${envName}`, {
  value: iamStack.aiAccessRole.roleArn,
  description: `AI access role ARN for ${envName} environment`,
  exportName: `${PROJECT_NAME}-AIAccessRoleArn-${envName}`,
})

// Tag all resources
cdk.Tags.of(app).add('Project', PROJECT_NAME)
cdk.Tags.of(app).add('Environment', envName)
cdk.Tags.of(app).add('ManagedBy', 'Cursor')

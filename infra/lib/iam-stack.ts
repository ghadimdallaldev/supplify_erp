import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export interface IAMStackProps extends cdk.StackProps {
  environment: string
  projectName: string
  githubRepo: string
}

export class IAMStack extends cdk.Stack {
  public readonly deployRole: iam.Role
  public readonly aiAccessRole: iam.Role

  constructor(scope: Construct, id: string, props: IAMStackProps) {
    super(scope, id, props)

    // OIDC Provider for GitHub Actions (shared across all environments)
    // Only create it for dev environment (first deployment) to avoid conflicts
    // Other environments will reference the existing provider
    let oidcProvider: iam.IOpenIdConnectProvider

    if (props.environment === 'dev') {
      // Create the OIDC provider in dev stack (first deployment)
      oidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOIDCProvider', {
        url: 'https://token.actions.githubusercontent.com',
        clientIds: ['sts.amazonaws.com'],
        thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
      })
    } else {
      // Reference existing OIDC provider for staging/prod
      // The ARN format is: arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com
      const accountId = props.env?.account || cdk.Aws.ACCOUNT_ID
      oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
        this,
        'GitHubOIDCProvider',
        `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`
      )
    }

    // Deploy Role for GitHub Actions
    // Trust policy allows branch refs, workflow runs, and environment deployments
    // Using wildcard pattern to match all valid GitHub Actions OIDC token subjects
    const branchRef =
      props.environment === 'prod' ? 'ref:refs/heads/main' : `ref:refs/heads/${props.environment}`
    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: `SupplifyDeployRole_${props.environment}`,
      description: `Role for GitHub Actions to deploy ${props.projectName} ${props.environment} environment`,
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          [`token.actions.githubusercontent.com:sub`]: `repo:${props.githubRepo}:*`,
        },
      }),
    })

    // Deploy Role Policy - Full permissions for infrastructure deployment
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:*',
          'ecs:*',
          'ecr:*',
          'rds:*',
          'logs:*',
          's3:*',
          'ec2:*',
          'secretsmanager:*',
          'route53:*',
          'acm:*',
          'cloudfront:*',
          'elasticloadbalancing:*',
          'application-autoscaling:*',
          'events:*',
          'ssm:*',
          'sts:GetCallerIdentity',
          'iam:PassRole',
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:GetRole',
          'iam:ListRoles',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:GetRolePolicy',
          'iam:ListRolePolicies',
          'iam:ListAttachedRolePolicies',
          'iam:TagRole',
          'iam:UntagRole',
          'iam:ListRoleTags',
          'xray:*',
          'cloudwatch:*',
          'wafv2:*',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:RequestTag/Environment': props.environment,
          },
        },
      })
    )

    // AI Access Role (read-only for Cursor AI)
    this.aiAccessRole = new iam.Role(this, 'AIAccessRole', {
      roleName: `SupplifyAIAccessRole_${props.environment}`,
      description: `Read-only role for AI (Cursor) to access ${props.projectName} ${props.environment} resources`,
      assumedBy: new iam.AccountPrincipal(props.env?.account || cdk.Aws.ACCOUNT_ID),
    })

    // AI Access Role Policy (read-only)
    this.aiAccessRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudwatch:Describe*',
          'cloudwatch:Get*',
          'cloudwatch:List*',
          'logs:Describe*',
          'logs:Get*',
          'logs:FilterLogEvents',
          'logs:StartQuery',
          'logs:StopQuery',
          'logs:TestMetricFilter',
          'ecs:Describe*',
          'ecs:List*',
          'rds:Describe*',
          'rds:List*',
          'xray:Get*',
          'xray:BatchGet*',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:ResourceTag/Environment': props.environment,
          },
        },
      })
    )

    // Outputs
    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description: `Deploy role ARN - Add this to GitHub Secrets as AWS_ROLE_ARN_${props.environment.toUpperCase()}`,
    })

    new cdk.CfnOutput(this, 'AIAccessRoleArn', {
      value: this.aiAccessRole.roleArn,
      description: 'AI access role ARN - Use this for Cursor AI access',
    })

    if (props.environment === 'dev') {
      new cdk.CfnOutput(this, 'OidcProviderArn', {
        value: oidcProvider.openIdConnectProviderArn,
        description: 'OIDC Provider ARN (shared across all environments)',
        exportName: 'Supplify-OidcProviderArn',
      })
    }
  }
}

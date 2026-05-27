import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export interface IAMStackProps extends cdk.StackProps {
  environment: string
  projectName: string
  env?: cdk.Environment
}

export class IAMStack extends cdk.Stack {
  public readonly deployRole: iam.Role
  public readonly aiAccessRole: iam.Role

  constructor(scope: Construct, id: string, props: IAMStackProps) {
    super(scope, id, props)

    const accountId = props.env?.account || cdk.Aws.ACCOUNT_ID

    // Role for CDK CLI / pipeline deploys (assumed from this AWS account).
    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: `SupplifyDeployRole_${props.environment}`,
      description: `CDK deployment role for ${props.projectName} ${props.environment} environment`,
      assumedBy: new iam.AccountPrincipal(accountId),
    })

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

    this.aiAccessRole = new iam.Role(this, 'AIAccessRole', {
      roleName: `SupplifyAIAccessRole_${props.environment}`,
      description: `Read-only role for AI (Cursor) to access ${props.projectName} ${props.environment} resources`,
      assumedBy: new iam.AccountPrincipal(accountId),
    })

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

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description: `Deploy role ARN for CDK deployments (${props.environment})`,
    })

    new cdk.CfnOutput(this, 'AIAccessRoleArn', {
      value: this.aiAccessRole.roleArn,
      description: 'AI access role ARN - Use this for Cursor AI access',
    })
  }
}

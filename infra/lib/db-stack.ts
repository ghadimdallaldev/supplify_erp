import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

export interface DbStackProps extends cdk.StackProps {
  environment: string
  projectName: string
  vpc: ec2.Vpc
  privateSubnets: ec2.ISubnet[]
  minCapacity: number
  maxCapacity: number
  env?: cdk.Environment
}

export class DbStack extends cdk.Stack {
  public readonly databaseSecret: secretsmanager.ISecret
  public readonly databaseEndpoint: string
  public readonly database: rds.DatabaseCluster

  constructor(scope: Construct, id: string, props: DbStackProps) {
    super(scope, id, props)

    // Create database secret
    this.databaseSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'postgres',
          dbname: 'supplify',
        }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
      description: 'RDS PostgreSQL database credentials',
    })

    // Create security group for the database
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Aurora PostgreSQL',
      allowAllOutbound: false,
    })

    // Create subnet group
    const subnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for Aurora PostgreSQL',
      vpcSubnets: {
        subnets: props.privateSubnets,
      },
    })

    // Create Aurora PostgreSQL Serverless v2 cluster
    this.database = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_3,
      }),
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      serverlessV2MinCapacity: props.minCapacity,
      serverlessV2MaxCapacity: props.maxCapacity,
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.privateSubnets,
      },
      subnetGroup,
      securityGroups: [dbSecurityGroup],
      writer: rds.ClusterInstance.serverlessV2('writer', {
        instanceIdentifier: 'writer',
      }),
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain on delete to preserve data
      deletionProtection: true,
      defaultDatabaseName: 'supplify',
      monitoringInterval: cdk.Duration.seconds(60),
      storageEncrypted: true,
    })

    // Get database endpoint
    this.databaseEndpoint = this.database.clusterEndpoint.hostname

    // Outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.databaseEndpoint,
      description: 'Database endpoint',
      exportName: `Supplify-DatabaseEndpoint-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.databaseSecret.secretArn,
      description: 'Database secret ARN',
      exportName: `Supplify-DatabaseSecretArn-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.database.clusterEndpoint.port.toString(),
      description: 'Database port',
    })
  }
}

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
  public readonly databasePort: number
  public readonly databaseCluster?: rds.DatabaseCluster
  public readonly databaseInstance?: rds.DatabaseInstance

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

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from within the VPC'
    )

    // Create subnet group
    const subnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for Aurora PostgreSQL',
      vpcSubnets: {
        subnets: props.privateSubnets,
      },
    })

    if (props.environment === 'dev') {
      this.databaseInstance = new rds.DatabaseInstance(this, 'DatabaseInstance', {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_12,
        }),
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
        credentials: rds.Credentials.fromSecret(this.databaseSecret),
        vpc: props.vpc,
        vpcSubnets: {
          subnets: props.privateSubnets,
        },
        subnetGroup,
        securityGroups: [dbSecurityGroup],
        allocatedStorage: 20,
        storageEncrypted: true,
        multiAz: false,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        deletionProtection: false,
        databaseName: 'supplify',
        backupRetention: cdk.Duration.days(1),
        deleteAutomatedBackups: true,
        publiclyAccessible: false,
        enablePerformanceInsights: false,
        autoMinorVersionUpgrade: true,
      })

      this.databaseEndpoint = this.databaseInstance.instanceEndpoint.hostname
      this.databasePort = this.databaseInstance.instanceEndpoint.port
    } else {
      this.databaseCluster = new rds.DatabaseCluster(this, 'Database', {
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

      this.databaseEndpoint = this.databaseCluster.clusterEndpoint.hostname
      this.databasePort = this.databaseCluster.clusterEndpoint.port
    }

    // Outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.databaseEndpoint,
      description: 'Database endpoint',
      exportName: `Supplify-DatabaseEndpoint-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.databasePort.toString(),
      description: 'Database port',
    })

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.databaseSecret.secretArn,
      description: 'Database secret ARN',
      exportName: `Supplify-DatabaseSecretArn-${props.environment}`,
    })
  }
}

import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as sns from 'aws-cdk-lib/aws-sns'
import { Construct } from 'constructs'

export interface EcsStackProps extends cdk.StackProps {
  environment: string
  projectName: string
  vpc: ec2.Vpc
  publicSubnets: ec2.ISubnet[]
  privateSubnets: ec2.ISubnet[]
  databaseSecret: secretsmanager.ISecret
  databaseEndpoint: string
  s3Bucket: s3.IBucket
  desiredCount: number
  minCapacity: number
  maxCapacity: number
  aiAccessRole?: iam.IRole
  env?: cdk.Environment
}

export class EcsStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer
  public readonly cluster: ecs.Cluster
  public readonly service: ecs.FargateService

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props)

    // Create ECS cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: `supplify-cluster-${props.environment}`,
      enableFargateCapacityProviders: true,
    })

    // Create security group for ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    })

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from anywhere'
    )
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from anywhere'
    )

    // Create Application Load Balancer
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: {
        subnets: props.publicSubnets,
      },
    })

    // Create security group for ECS tasks
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
    })

    // Allow ALB to communicate with ECS tasks
    ecsSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(4000), 'Allow traffic from ALB')

    // Create task execution role
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    })

    // Grant task execution role access to secrets
    props.databaseSecret.grantRead(taskExecutionRole)

    // Create task role (for application to access AWS services)
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    })

    // Grant S3 access to task role
    props.s3Bucket.grantReadWrite(taskRole)

    // Create CloudWatch log group (should match ObservabilityStack)
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/supplify/api/${props.environment}`,
      retention:
        props.environment === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // Create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64, // Use Graviton
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })

    // Create container
    const container = taskDefinition.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromRegistry('nginx:latest'), // Placeholder - will be updated by deployment
      containerName: 'supplify-api',
      memoryLimitMiB: 1024,
      cpu: 512,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'supplify-api',
        logGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        PORT: '4000',
        DATABASE_ENDPOINT: props.databaseEndpoint,
        DATABASE_PORT: '5432',
        DATABASE_NAME: 'supplify',
        S3_BUCKET: props.s3Bucket.bucketName,
        S3_REGION: props.env?.region || 'me-south-1',
      },
      secrets: {
        DATABASE_SECRET: ecs.Secret.fromSecretsManager(props.databaseSecret),
      },
    })

    container.addPortMappings({
      containerPort: 4000,
      protocol: ecs.Protocol.TCP,
    })

    // Create Fargate service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: props.desiredCount,
      serviceName: `supplify-api-${props.environment}`,
      assignPublicIp: false,
      vpcSubnets: {
        subnets: props.privateSubnets,
      },
      securityGroups: [ecsSecurityGroup],
      enableExecuteCommand: true, // Enable for debugging
      minHealthyPercent: props.environment === 'prod' ? 100 : 50,
      maxHealthyPercent: props.environment === 'prod' ? 200 : 200,
    })

    // Enable auto-scaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: props.minCapacity,
      maxCapacity: props.maxCapacity,
    })

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    })

    // Create target group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    })

    this.service.attachToApplicationTargetGroup(targetGroup)

    // Create listener
    const listener = this.alb.addListener('Listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    })

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS cluster name',
      exportName: `Supplify-ClusterName-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'ECS service name',
      exportName: `Supplify-ServiceName-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
      exportName: `Supplify-AlbDnsName-${props.environment}`,
    })

    // AI access role permissions are configured in IAMStack
    // Note: logGroup.grantRead() creates cross-stack references, so we configure permissions in IAMStack instead
  }
}

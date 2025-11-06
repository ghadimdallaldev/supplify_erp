import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'

export interface VpcStackProps extends cdk.StackProps {
  environment: string
  projectName: string
  env?: cdk.Environment
}

export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly publicSubnets: ec2.ISubnet[]
  public readonly privateSubnets: ec2.ISubnet[]

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props)

    // Create VPC with 2 public and 2 private subnets across 2 AZs
    // Use fewer NAT gateways for dev/staging to save costs
    const natGateways = props.environment === 'prod' ? 2 : 1

    // me-south-1 region has 3 availability zones: me-south-1a, me-south-1b, me-south-1c
    // Use 2 AZs for high availability
    const region = props.env?.region || 'me-south-1'
    const availabilityZones = [`${region}a`, `${region}b`]

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      availabilityZones: availabilityZones,
      natGateways: natGateways,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    })

    // Get subnets
    this.publicSubnets = this.vpc.publicSubnets
    this.privateSubnets = this.vpc.privateSubnets

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `Supplify-VpcId-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.publicSubnets.map((s) => s.subnetId).join(','),
      description: 'Public Subnet IDs',
    })

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.privateSubnets.map((s) => s.subnetId).join(','),
      description: 'Private Subnet IDs',
    })
  }
}

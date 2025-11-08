import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export interface S3CloudFrontStackProps extends cdk.StackProps {
  environment: string
  projectName: string
  env?: cdk.Environment
}

export class S3CloudFrontStack extends cdk.Stack {
  public readonly bucket: s3.Bucket
  public readonly websiteUrl: string

  constructor(scope: Construct, id: string, props: S3CloudFrontStackProps) {
    super(scope, id, props)

    // Create S3 bucket configured for static website hosting
    this.bucket = new s3.Bucket(this, 'StaticAssetsBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    })

    // Allow public read access for website content
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetObject'],
        resources: [this.bucket.arnForObjects('*')],
      })
    )

    this.websiteUrl = this.bucket.bucketWebsiteUrl

    new cdk.CfnOutput(this, 'StaticAssetsBucketName', {
      value: this.bucket.bucketName,
      description: 'Static assets S3 bucket name',
      exportName: `Supplify-StaticAssetsBucketName-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'StaticWebsiteUrl', {
      value: this.bucket.bucketWebsiteUrl,
      description: 'S3 static website URL',
      exportName: `Supplify-StaticWebsiteUrl-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'StaticWebsiteDomainName', {
      value: this.bucket.bucketWebsiteDomainName,
      description: 'S3 static website domain name',
    })
  }
}

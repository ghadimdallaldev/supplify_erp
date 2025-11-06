import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'

export interface S3StackProps extends cdk.StackProps {
  environment: string
  projectName: string
  env?: cdk.Environment
}

export class S3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket

  constructor(scope: Construct, id: string, props: S3StackProps) {
    super(scope, id, props)

    // Create S3 bucket for file uploads
    this.bucket = new s3.Bucket(this, 'FileBucket', {
      bucketName: `supplify-files-${props.environment}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
        {
          id: 'DeleteIncompleteUploads',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    })

    // Outputs
    new cdk.CfnOutput(this, 'S3BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name',
      exportName: `Supplify-S3BucketName-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'S3BucketArn', {
      value: this.bucket.bucketArn,
      description: 'S3 bucket ARN',
    })

    new cdk.CfnOutput(this, 'S3BucketDomainName', {
      value: this.bucket.bucketDomainName,
      description: 'S3 bucket domain name',
    })
  }
}

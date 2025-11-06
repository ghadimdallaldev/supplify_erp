import * as cdk from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import { Construct } from 'constructs'

export interface S3CloudFrontStackProps extends cdk.StackProps {
  environment: string
  projectName: string
  env?: cdk.Environment
}

export class S3CloudFrontStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution
  public readonly bucket: s3.Bucket

  constructor(scope: Construct, id: string, props: S3CloudFrontStackProps) {
    super(scope, id, props)

    // Create S3 bucket for static assets
    this.bucket = new s3.Bucket(this, 'StaticAssetsBucket', {
      bucketName: `supplify-static-${props.environment}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
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

    // Create WAF Web ACL (optional - for production)
    let webAcl: wafv2.CfnWebACL | undefined

    if (props.environment === 'prod') {
      webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
        name: `supplify-waf-${props.environment}`,
        scope: 'CLOUDFRONT',
        defaultAction: { allow: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: `supplify-waf-${props.environment}`,
        },
        rules: [
          {
            name: 'AWSManagedRulesCommonRuleSet',
            priority: 0,
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
            overrideAction: { none: {} },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'CommonRuleSet',
            },
          },
          {
            name: 'AWSManagedRulesKnownBadInputsRuleSet',
            priority: 1,
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesKnownBadInputsRuleSet',
              },
            },
            overrideAction: { none: {} },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'KnownBadInputs',
            },
          },
        ],
      })
    }

    // Create CloudFront distribution
    const distributionProps: cloudfront.DistributionProps = {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
      ],
      enabled: true,
      comment: `${props.projectName} CloudFront distribution for ${props.environment} environment`,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      ...(webAcl && { webAclId: webAcl.attrArn }),
    }

    this.distribution = new cloudfront.Distribution(this, 'Distribution', distributionProps)

    // Outputs
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `Supplify-CloudFrontDistributionId-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: `Supplify-CloudFrontDomainName-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'StaticAssetsBucketName', {
      value: this.bucket.bucketName,
      description: 'Static assets S3 bucket name',
      exportName: `Supplify-StaticAssetsBucketName-${props.environment}`,
    })

    if (webAcl) {
      new cdk.CfnOutput(this, 'WebACLId', {
        value: webAcl.attrId,
        description: 'WAF Web ACL ID',
        exportName: `Supplify-WebACLId-${props.environment}`,
      })
    }
  }
}

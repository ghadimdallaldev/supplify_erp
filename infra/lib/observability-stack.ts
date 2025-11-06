import * as cdk from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import * as xray from 'aws-cdk-lib/aws-xray'
import { Construct } from 'constructs'

export interface ObservabilityStackProps extends cdk.StackProps {
  environment: string
  projectName: string
}

export class ObservabilityStack extends cdk.Stack {
  public readonly logGroup: logs.LogGroup
  public readonly topic: sns.Topic
  public readonly dashboard: cloudwatch.Dashboard

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props)

    // CloudWatch Log Group
    this.logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/supplify/api/${props.environment}`,
      retention:
        props.environment === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // SNS Topic for alarms
    this.topic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `supplify-alarms-${props.environment}`,
      displayName: `Supplify Alarms - ${props.environment}`,
    })

    // Add email subscription (optional - can be configured via AWS Console)
    // this.topic.addSubscription(new snsSubscriptions.EmailSubscription('alerts@example.com'))

    // CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `Supplify-${props.environment}`,
    })

    // X-Ray Sampling Rule - configured via ECS task definition or application code
    // Note: X-Ray sampling can be configured in the application or via AWS Console

    // Outputs
    new cdk.CfnOutput(this, 'LogGroupName', {
      value: this.logGroup.logGroupName,
      description: 'CloudWatch Log Group name',
      exportName: `Supplify-LogGroupName-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.topic.topicArn,
      description: 'SNS Topic ARN for alarms',
      exportName: `Supplify-AlarmTopicArn-${props.environment}`,
    })

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${props.env?.region || 'us-east-1'}.console.aws.amazon.com/cloudwatch/home?region=${props.env?.region || 'us-east-1'}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    })
  }
}

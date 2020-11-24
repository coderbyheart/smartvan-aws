import * as CloudFormation from '@aws-cdk/core'
import * as IoT from '@aws-cdk/aws-iot'
import * as IAM from '@aws-cdk/aws-iam'

/**
 * This stores the sensor data as CloudWatch metrics so they can be visualized
 * on a dashboard.
 */
export class StoreSensorDataAsCloudWatchMetrics extends CloudFormation.Resource {
	public constructor(parent: CloudFormation.Stack, id: string) {
		super(parent, id)

		const role = new IAM.Role(this, 'Role', {
			assumedBy: new IAM.ServicePrincipal('iot.amazonaws.com'),
			inlinePolicies: {
				rootPermissions: new IAM.PolicyDocument({
					statements: [
						new IAM.PolicyStatement({
							actions: ['cloudwatch:PutMetricData'],
							resources: [`*`],
						}),
						new IAM.PolicyStatement({
							actions: ['iot:Publish'],
							resources: [
								`arn:aws:iot:${parent.region}:${parent.account}:topic/errors`,
							],
						}),
					],
				}),
			},
		})

		;['inside', 'outside'].map(
			(t) =>
				new IoT.CfnTopicRule(this, `${t}Rule`, {
					topicRulePayload: {
						awsIotSqlVersion: '2016-03-23',
						description: `stores the sensor data "${t}" as CloudWatch metrics so they can be visualized on a dashboard`,
						ruleDisabled: false,
						sql: `SELECT state.reported.${t} AS value FROM '$aws/things/+/shadow/update/accepted' WHERE state.reported.${t} <> NULL`,
						actions: [
							{
								cloudwatchMetric: {
									metricNamespace: 'SmartVan',
									metricName: t,
									metricUnit: 'Count',
									metricValue: '${' + `state.reported.${t}` + '}',
									roleArn: role.roleArn,
								},
							},
						],
						errorAction: {
							republish: {
								roleArn: role.roleArn,
								topic: 'errors',
							},
						},
					},
				}),
		)
	}
}

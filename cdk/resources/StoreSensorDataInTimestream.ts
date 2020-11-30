import * as CloudFormation from '@aws-cdk/core'
import * as IoT from '@aws-cdk/aws-iot'
import * as IAM from '@aws-cdk/aws-iam'
import * as Timestream from '@aws-cdk/aws-timestream'
import * as Lambda from '@aws-cdk/aws-lambda'
import { LambdaLogGroup } from './LambdaLogGroup'
import { SmartVanLambdas } from '../prepare-resources'
import { LambdasWithLayer } from './LambdasWithLayer'

/**
 * This stores the sensor data in Timestream they can be visualized
 * on a dashboard.
 */
export class StoreSensorDataInTimestream extends CloudFormation.Resource {
	public constructor(
		parent: CloudFormation.Stack,
		id: string,
		{
			smartVanLambdas,
		}: {
			smartVanLambdas: LambdasWithLayer<SmartVanLambdas>
		},
	) {
		super(parent, id)

		const db = new Timestream.CfnDatabase(this, 'db')
		const table = new Timestream.CfnTable(this, 'table', {
			databaseName: db.ref,
			retentionProperties: {
				MemoryStoreRetentionPeriodInHours: '24',
				MagneticStoreRetentionPeriodInDays: '365',
			},
		})

		const role = new IAM.Role(this, 'Role', {
			assumedBy: new IAM.ServicePrincipal('iot.amazonaws.com'),
			inlinePolicies: {
				rootPermissions: new IAM.PolicyDocument({
					statements: [
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

		// FIXME: CloudFormation currently does not support IoT actions for timestream, once it does (https://github.com/aws-cloudformation/aws-cloudformation-coverage-roadmap/issues/663) remove the lambda handling the message insert.

		const storeMessagesInTimestream = new Lambda.Function(this, 'lambda', {
			layers: smartVanLambdas.layers,
			handler: 'index.handler',
			runtime: Lambda.Runtime.NODEJS_12_X,
			timeout: CloudFormation.Duration.seconds(60),
			memorySize: 1792,
			code: smartVanLambdas.lambdas.storeMessagesInTimestream,
			description:
				'Processes devices messages and updates and stores them in Timestream',
			initialPolicy: [
				new IAM.PolicyStatement({
					resources: ['*'],
					actions: [
						'logs:CreateLogGroup',
						'logs:CreateLogStream',
						'logs:PutLogEvents',
					],
				}),
				new IAM.PolicyStatement({
					actions: ['timestream:WriteRecords'],
					resources: [table.attrArn],
				}),
				new IAM.PolicyStatement({
					actions: ['timestream:DescribeEndpoints'],
					resources: ['*'],
				}),
			],
			environment: {
				TABLE_INFO: table.ref,
			},
		})

		new LambdaLogGroup(this, 'lambdaLogGroup', storeMessagesInTimestream)

		const storeUpdatesRule = new IoT.CfnTopicRule(this, `IotRule`, {
			topicRulePayload: {
				awsIotSqlVersion: '2016-03-23',
				description: `stores the sensor data in Timestream so they can be visualized on a dashboard`,
				ruleDisabled: false,
				sql: `SELECT state.reported AS reported, timestamp() as timestamp, clientid() as deviceId FROM '$aws/things/+/shadow/update/accepted'`,
				actions: [
					{
						lambda: {
							functionArn: storeMessagesInTimestream.functionArn,
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
		})

		storeMessagesInTimestream.addPermission('storeUpdatesRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: storeUpdatesRule.attrArn,
		})
	}
}

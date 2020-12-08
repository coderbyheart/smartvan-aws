import * as CloudFormation from '@aws-cdk/core'
import * as Lambda from '@aws-cdk/aws-lambda'
import * as IAM from '@aws-cdk/aws-iam'
import * as S3 from '@aws-cdk/aws-s3'
import * as Iot from '@aws-cdk/aws-iot'
import {
	CDKLambdas,
	PackedLambdas,
	SmartVanLambdas,
} from '../prepare-resources'
import { ThingGroupLambda } from '../resources/ThingGroupLambda'
import { ThingGroup } from '../resources/ThingGroup'
import { CORE_STACK_NAME } from './stackName'
import { lambdasOnS3 } from '../resources/lambdasOnS3'
import { StoreSensorDataInTimestream } from '../resources/StoreSensorDataInTimestream'
import { Webapp } from '../resources/Webapp'

export class SmartVanStack extends CloudFormation.Stack {
	public constructor(
		parent: CloudFormation.App,
		{
			mqttEndpoint,
			sourceCodeBucketName,
			packedCDKLambdas,
			packedSmartVanLambdas,
		}: {
			mqttEndpoint: string
			sourceCodeBucketName: string
			packedCDKLambdas: PackedLambdas<CDKLambdas>
			packedSmartVanLambdas: PackedLambdas<SmartVanLambdas>
		},
	) {
		super(parent, CORE_STACK_NAME)

		const sourceCodeBucket = S3.Bucket.fromBucketAttributes(
			this,
			'SourceCodeBucket',
			{
				bucketName: sourceCodeBucketName,
			},
		)
		const lambasOnBucket = lambdasOnS3(sourceCodeBucket)

		const cloudFormationLayer = new Lambda.LayerVersion(
			this,
			`${CORE_STACK_NAME}-cloudformation-layer`,
			{
				code: Lambda.Code.fromBucket(
					sourceCodeBucket,
					packedCDKLambdas.layerZipFileName,
				),
				compatibleRuntimes: [Lambda.Runtime.NODEJS_12_X],
			},
		)

		new CloudFormation.CfnOutput(this, 'cloudformationLayerVersionArn', {
			value: cloudFormationLayer.layerVersionArn,
			exportName: `${this.stackName}:cloudformationLayerVersionArn`,
		})

		new CloudFormation.CfnOutput(this, 'mqttEndpoint', {
			value: mqttEndpoint,
			exportName: `${this.stackName}:mqttEndpoint`,
		})

		const iotJitpRole = new IAM.Role(this, 'iotJitpRole', {
			assumedBy: new IAM.ServicePrincipal('iot.amazonaws.com'),
			managedPolicies: [
				{
					managedPolicyArn:
						'arn:aws:iam::aws:policy/service-role/AWSIoTThingsRegistration',
				},
				{
					managedPolicyArn:
						'arn:aws:iam::aws:policy/service-role/AWSIoTLogging',
				},
			],
		})

		new CloudFormation.CfnOutput(this, 'jitpRoleArn', {
			value: iotJitpRole.roleArn,
			exportName: `${this.stackName}:jitpRoleArn`,
		})

		const iotThingPolicy = new Iot.CfnPolicy(this, 'thingPolicy', {
			policyDocument: {
				Version: '2012-10-17',
				Statement: [
					{
						Effect: 'Allow',
						Action: ['iot:Connect'],
						Resource: ['arn:aws:iot:*:*:client/${iot:ClientId}'],
						Condition: {
							Bool: {
								'iot:Connection.Thing.IsAttached': [true],
							},
						},
					},
					{
						Effect: 'Allow',
						Action: ['iot:Receive'],
						Resource: ['*'],
					},
					{
						Effect: 'Allow',
						Action: ['iot:Subscribe'],
						Resource: [
							'arn:aws:iot:*:*:topicfilter/$aws/things/${iot:ClientId}/*',
						],
					},
					{
						Effect: 'Allow',
						Action: ['iot:Publish'],
						Resource: [
							'arn:aws:iot:*:*:topic/$aws/things/${iot:ClientId}/*',
							'arn:aws:iot:*:*:topic/${iot:ClientId}/batch',
							'arn:aws:iot:*:*:topic/${iot:ClientId}/messages',
						],
					},
				],
			},
		})

		new CloudFormation.CfnOutput(this, 'thingPolicyArn', {
			value: iotThingPolicy.attrArn,
			exportName: `${this.stackName}:thingPolicyArn`,
		})

		const cdkLambdas = {
			lambdas: lambasOnBucket(packedCDKLambdas),
			layers: [cloudFormationLayer],
		}

		const thingGroupLambda = new ThingGroupLambda(this, 'thingGroupLambda', {
			cdkLambdas,
		})

		new CloudFormation.CfnOutput(this, 'thingGroupLambdaArn', {
			value: thingGroupLambda.function.functionArn,
			exportName: `${this.stackName}:thingGroupLambdaArn`,
		})

		new ThingGroup(this, 'deviceThingGroup', {
			name: CORE_STACK_NAME,
			description: 'Group created for SmartVan Things',
			PolicyName: iotThingPolicy.ref,
			thingGroupLambda: thingGroupLambda.function,
		})

		new CloudFormation.CfnOutput(this, 'thingGroupName', {
			value: CORE_STACK_NAME,
			exportName: `${this.stackName}:thingGroupName`,
		})

		const smartVanLayer = new Lambda.LayerVersion(
			this,
			`${CORE_STACK_NAME}-smartvan-layer`,
			{
				code: Lambda.Code.fromBucket(
					sourceCodeBucket,
					packedSmartVanLambdas.layerZipFileName,
				),
				compatibleRuntimes: [Lambda.Runtime.NODEJS_12_X],
			},
		)

		const smartVanLambdas = {
			lambdas: lambasOnBucket(packedSmartVanLambdas),
			layers: [smartVanLayer],
		}

		const history = new StoreSensorDataInTimestream(
			this,
			'storeSensorDataInCloudWatch',
			{
				smartVanLambdas: smartVanLambdas,
			},
		)

		new CloudFormation.CfnOutput(this, 'historyTableInfo', {
			value: history.table.ref,
			exportName: `${this.stackName}:historyTableInfo`,
		})

		const webapp = new Webapp(this, 'webapp', { history })

		new CloudFormation.CfnOutput(this, 'userPoolId', {
			value: webapp.userPool.userPoolId,
			exportName: `${this.stackName}:userPoolId`,
		})

		new CloudFormation.CfnOutput(this, 'identityPoolId', {
			value: webapp.identityPool.ref,
			exportName: `${this.stackName}:identityPoolId`,
		})

		new CloudFormation.CfnOutput(this, 'userPoolClientId', {
			value: webapp.userPoolClient.userPoolClientId,
			exportName: `${this.stackName}:userPoolClientId`,
		})
	}
}

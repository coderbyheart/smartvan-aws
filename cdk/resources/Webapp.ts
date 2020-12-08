import * as CloudFormation from '@aws-cdk/core'
import * as Cognito from '@aws-cdk/aws-cognito'
import * as IAM from '@aws-cdk/aws-iam'
import { StoreSensorDataInTimestream } from './StoreSensorDataInTimestream'

/**
 * Provides the resources for the SmartVan web app
 */
export class Webapp extends CloudFormation.Resource {
	public readonly userPool: Cognito.IUserPool
	public readonly userPoolClient: Cognito.IUserPoolClient
	public readonly identityPool: Cognito.CfnIdentityPool

	public constructor(
		parent: CloudFormation.Construct,
		id: string,
		{ history }: { history: StoreSensorDataInTimestream },
	) {
		super(parent, id)

		this.userPool = new Cognito.UserPool(this, 'userPool', {
			userPoolName: this.stack.stackName,
			signInAliases: {
				email: true,
			},
			autoVerify: {
				email: true,
			},
			selfSignUpEnabled: false,
			passwordPolicy: {
				requireSymbols: false,
			},
		})

		this.userPoolClient = new Cognito.UserPoolClient(this, 'userPoolClient', {
			userPool: this.userPool,
			authFlows: {
				userPassword: true,
				userSrp: true,
				adminUserPassword: true,
			},
		})

		this.identityPool = new Cognito.CfnIdentityPool(this, 'identityPool', {
			identityPoolName: this.stack.stackName,
			allowUnauthenticatedIdentities: false,
			cognitoIdentityProviders: [
				{
					clientId: this.userPoolClient.userPoolClientId,
					providerName: (this.userPool as Cognito.UserPool)
						.userPoolProviderName,
				},
			],
		})

		const userRole = new IAM.Role(this, 'userRole', {
			assumedBy: new IAM.FederatedPrincipal(
				'cognito-identity.amazonaws.com',
				{
					StringEquals: {
						'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
					},
					'ForAnyValue:StringLike': {
						'cognito-identity.amazonaws.com:amr': 'authenticated',
					},
				},
				'sts:AssumeRoleWithWebIdentity',
			),
			inlinePolicies: {
				timestreamQuery: new IAM.PolicyDocument({
					statements: [
						new IAM.PolicyStatement({
							resources: [history.table.attrArn],
							actions: [
								'timestream:Select',
								'timestream:DescribeTable',
								'timestream:ListMeasures',
							],
						}),
						new IAM.PolicyStatement({
							resources: ['*'],
							actions: [
								'timestream:DescribeEndpoints',
								'timestream:SelectValues',
								'timestream:CancelQuery',
							],
						}),
					],
				}),
			},
		})

		const unauthenticatedUserRole = new IAM.Role(
			this,
			'unauthenticatedUserRole',
			{
				assumedBy: new IAM.FederatedPrincipal(
					'cognito-identity.amazonaws.com',
					{
						StringEquals: {
							'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
						},
						'ForAnyValue:StringLike': {
							'cognito-identity.amazonaws.com:amr': 'unauthenticated',
						},
					},
					'sts:AssumeRoleWithWebIdentity',
				),
			},
		)

		new Cognito.CfnIdentityPoolRoleAttachment(this, 'identityPoolRoles', {
			identityPoolId: this.identityPool.ref.toString(),
			roles: {
				authenticated: userRole.roleArn,
				unauthenticated: unauthenticatedUserRole.roleArn,
			},
		})
	}
}

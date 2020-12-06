import * as CloudFormation from '@aws-cdk/core'
import * as Cognito from '@aws-cdk/aws-cognito'
import * as IAM from '@aws-cdk/aws-iam'
import * as CloudFront from '@aws-cdk/aws-cloudfront'
import * as S3 from '@aws-cdk/aws-s3'

/**
 * Provides the resources for the SmartVan web app
 */
export class Webapp extends CloudFormation.Resource {
	public readonly userPool: Cognito.IUserPool
	public readonly userPoolClient: Cognito.IUserPoolClient
	public readonly identityPool: Cognito.CfnIdentityPool
	public readonly bucket: S3.IBucket
	public readonly distribution: CloudFront.CfnDistribution

	public constructor(parent: CloudFormation.Construct, id: string) {
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
			inlinePolicies: {},
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

		this.bucket = new S3.Bucket(this, 'bucket', {
			publicReadAccess: true,
			cors: [
				{
					allowedHeaders: ['*'],
					allowedMethods: [S3.HttpMethods.GET],
					allowedOrigins: ['*'],
					exposedHeaders: ['Date'],
					maxAge: 3600,
				},
			],
			removalPolicy: CloudFormation.RemovalPolicy.DESTROY,
			websiteIndexDocument: 'index.html',
			websiteErrorDocument: 'index.html',
		})

		this.distribution = new CloudFront.CfnDistribution(
			this,
			'websiteDistribution',
			{
				distributionConfig: {
					enabled: true,
					priceClass: 'PriceClass_100',
					defaultRootObject: 'index.html',
					defaultCacheBehavior: {
						allowedMethods: ['HEAD', 'GET', 'OPTIONS'],
						cachedMethods: ['HEAD', 'GET'],
						compress: true,
						forwardedValues: {
							queryString: true,
							headers: [
								'Access-Control-Request-Headers',
								'Access-Control-Request-Method',
								'Origin',
							],
						},
						smoothStreaming: false,
						targetOriginId: 'S3',
						viewerProtocolPolicy: 'redirect-to-https',
					},
					ipv6Enabled: true,
					viewerCertificate: {
						cloudFrontDefaultCertificate: true,
					},
					origins: [
						{
							domainName: `${this.bucket.bucketName}.s3-website.${this.stack.region}.amazonaws.com`,
							id: 'S3',
							customOriginConfig: {
								originProtocolPolicy: 'http-only',
							},
						},
					],
				},
			},
		)
	}
}

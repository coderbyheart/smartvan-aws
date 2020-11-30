import { App } from '@aws-cdk/core'
import { SmartVanStack } from '../stacks/Core'
import {
	CDKLambdas,
	PackedLambdas,
	SmartVanLambdas,
} from '../prepare-resources'

export class SmartVanApp extends App {
	public constructor(args: {
		mqttEndpoint: string
		sourceCodeBucketName: string
		packedCDKLambdas: PackedLambdas<CDKLambdas>
		packedSmartVanLambdas: PackedLambdas<SmartVanLambdas>
		context?: Record<string, any>
	}) {
		super({ context: args.context })
		new SmartVanStack(this, {
			...args,
		})
	}
}

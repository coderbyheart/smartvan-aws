import { SmartVanApp } from './apps/Core'
import {
	prepareResources,
	prepareCDKLambdas,
	prepareSmartVanLambdas,
} from './prepare-resources'

const rootDir = process.cwd()

Promise.all([
	prepareResources({
		region: process.env.AWS_REGION as string,
		rootDir,
	}).then(async (res) => ({
		...res,
		packedCDKLambdas: await prepareCDKLambdas({
			...res,
			rootDir,
		}),
		packedSmartVanLambdas: await prepareSmartVanLambdas({
			...res,
			rootDir,
		}),
	})),
])
	.then(([args]) =>
		new SmartVanApp({
			...args,
			context: {
				version: process.env.VERSION ?? '0.0.0-development',
			},
		}).synth(),
	)
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})

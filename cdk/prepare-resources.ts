import { Iot } from 'aws-sdk'
import * as path from 'path'
import { promises as fs } from 'fs'
import { getLambdaSourceCodeBucketName } from './helper/getLambdaSourceCodeBucketName'
import {
	LayeredLambdas,
	packBaseLayer,
	packLayeredLambdas,
	WebpackMode,
} from '@bifravst/package-layered-lambdas'
import { getIotEndpoint } from './helper/getIotEndpoint'
import { spawn } from 'child_process'
import { ConsoleProgressReporter } from '@bifravst/package-layered-lambdas/dist/src/reporter'

export type CDKLambdas = {
	createThingGroup: string
}

export const prepareResources = async ({
	region,
	rootDir,
}: {
	region: string
	rootDir: string
}): Promise<{
	mqttEndpoint: string
	outDir: string
	sourceCodeBucketName: string
}> => {
	// Detect the AWS IoT endpoint
	const endpointAddress = await getIotEndpoint(
		new Iot({
			region,
		}),
	)

	// Storeage for packed lambdas
	const outDir = path.resolve(rootDir, 'dist', 'lambdas')
	try {
		await fs.stat(outDir)
	} catch (_) {
		await fs.mkdir(outDir)
	}

	return {
		mqttEndpoint: endpointAddress,
		sourceCodeBucketName: await getLambdaSourceCodeBucketName(),
		outDir,
	}
}

export type PackedLambdas<
	A extends {
		[key: string]: string
	}
> = {
	lambdas: LayeredLambdas<A>
	layerZipFileName: string
}

export const prepareCDKLambdas = async ({
	rootDir,
	outDir,
	sourceCodeBucketName,
}: {
	rootDir: string
	outDir: string
	sourceCodeBucketName: string
}): Promise<PackedLambdas<CDKLambdas>> => {
	const reporter = ConsoleProgressReporter('CDK Lambdas')
	return {
		layerZipFileName: await (async () => {
			reporter.progress('base-layer')('Writing package.json')
			const cloudFormationLayerDir = path.resolve(
				rootDir,
				'dist',
				'lambdas',
				'cloudFormationLayer',
			)
			try {
				await fs.stat(cloudFormationLayerDir)
			} catch (_) {
				await fs.mkdir(cloudFormationLayerDir)
			}
			const devDeps = JSON.parse(
				await fs.readFile(path.resolve(rootDir, 'package.json'), 'utf-8'),
			).devDependencies
			await fs.writeFile(
				path.join(cloudFormationLayerDir, 'package.json'),
				JSON.stringify({
					dependencies: {
						'aws-sdk': devDeps['aws-sdk'],
						'@bifravst/cloudformation-helpers':
							devDeps['@bifravst/cloudformation-helpers'],
					},
				}),
				'utf-8',
			)
			reporter.progress('base-layer')('Installing dependencies')
			await new Promise<void>((resolve, reject) => {
				const p = spawn('npm', ['i', '--ignore-scripts', '--only=prod'], {
					cwd: cloudFormationLayerDir,
				})
				p.on('close', (code) => {
					if (code !== 0) {
						const msg = `[CloudFormation Layer] npm i in ${cloudFormationLayerDir} exited with code ${code}.`
						return reject(new Error(msg))
					}
					return resolve()
				})
			})
			return await packBaseLayer({
				reporter,
				srcDir: cloudFormationLayerDir,
				outDir,
				Bucket: sourceCodeBucketName,
			})
		})(),
		lambdas: await packLayeredLambdas<CDKLambdas>({
			reporter,
			id: 'CDK',
			mode: WebpackMode.production,
			srcDir: rootDir,
			outDir,
			Bucket: sourceCodeBucketName,
			lambdas: {
				createThingGroup: path.resolve(
					rootDir,
					'cdk',
					'lambda',
					'createThingGroup.ts',
				),
			},
			tsConfig: path.resolve(rootDir, 'tsconfig.json'),
		}),
	}
}

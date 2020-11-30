import { TimestreamWrite } from 'aws-sdk'
import { v4 } from 'uuid'

const [DatabaseName, TableName] = process.env.TABLE_INFO?.split('|') ?? ['', '']

const timestream = new TimestreamWrite()

/**
 * Processes device messages and updates and stores the in Timestream
 */
export const handler = async (event: {
	reported: Record<string, any>
	timestamp: number
	deviceId: string
}): Promise<void> => {
	console.log(JSON.stringify(event))

	const { deviceId, reported, timestamp } = event

	try {
		const w = {
			CommonAttributes: {
				Dimensions: [
					{
						Name: 'deviceId',
						Value: deviceId,
					},
					{
						Name: 'measureGroup',
						Value: v4(),
					},
				],
			},
			DatabaseName,
			TableName,
			Records: Object.entries(reported)
				.filter(([k]) =>
					['inside', 'inside_rssi', 'outside', 'outside_rssi'].includes(k),
				)
				.map(([MeasureName, v]) => ({
					MeasureName,
					MeasureValue: `${v}`,
					MeasureValueType: 'DOUBLE',
					Time: `${timestamp}`,
				})),
		}
		console.log(JSON.stringify(w))
		await timestream.writeRecords(w).promise()
	} catch (err) {
		console.error(err)
		console.error(
			JSON.stringify({
				error: err.message,
			}),
		)
		return
	}
}

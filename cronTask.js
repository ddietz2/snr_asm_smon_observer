const winston = require('winston');
const axios = require('axios');
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const config = require('./config/parameters');

module.exports = async () => {
	try {
		networkDevicesASMCount = await getAsmRessourceCount(config.ASM_TYPE_NETWORK_DEVICE);
		const networkDevicesASM = await getAsmData(config.ASM_TYPE_NETWORK_DEVICE, networkDevicesASMCount);

		connectivityServicesASMCount = await getAsmRessourceCount(config.ASM_TYPE_CONNECTIVITY_SERVICE);
		const connectivityServicesASM = await getAsmData(config.ASM_TYPE_CONNECTIVITY_SERVICE, connectivityServicesASMCount);

		const { connectivityServices: connectivityServicesSMON, relations } = await collectSmonData(Object.values(networkDevicesASM));

		await syncAsm(connectivityServicesASM, connectivityServicesSMON);

		await sendToAsm(connectivityServicesSMON, relations);
	} catch (error) {
		winston.error(error.stack);
	}
};

function getAsmRessourceCount(ressourceName) {
	return new Promise(async (resolve, reject) => {
		try {
			const URL = config.ASM_BASE_URL + config.ASM_TOPO_PATH + config.ASM_EP_RES + config.ASM_EP_RES_CNT.replace('__RESOURCE_TYPE__', ressourceName);

			winston.info(`Collecting the total amount of ressources of type "${ressourceName}" from ASM using URL 
      ${URL} ...`);

			const headers = {
				Authorization: `Basic ${config.TOKEN}`,
				'X-TenantID': config.X_TENANT_ID,
			};

			const { data } = await axios.get(URL, {
				headers: headers,
			});

			winston.info(`Received data: ${JSON.stringify(data, null, 2)}`);

			if (data?._count > 0) {
				const asmResCount = data._count;
				winston.info(`Done collecting total amount of ressources of type "${ressourceName}" from ASM. Found ${asmResCount} items.`);
				resolve(asmResCount);
			} else {
				winston.info(`Done collecting total amount of ressources of type "${ressourceName}" from ASM. Found an unexpected count, returning 0.`);
				resolve(0);
			}
		} catch (error) {
			winston.error(`Error collecting total amount of ressources of type "${ressourceName}" from ASM.`);
			reject(error);
		}
	});
}

function getAsmData(ressourceName, ressourceCount) {
	return new Promise(async (resolve, reject) => {
		const numApiCalls = Math.ceil(ressourceCount / config.ASM_BATCH_SIZE);

		winston.info(`Will be running ${numApiCalls} call(s) against the ASM API fetching ressources of type ${ressourceName} with a batch size of ${config.ASM_BATCH_SIZE} each.`);

		const staticUrlPart = config.ASM_BASE_URL + config.ASM_TOPO_PATH + config.ASM_EP_RES;

		let asmEntities = {};

		for (let i = 0; i < numApiCalls; i++) {
			const __LIMIT__ = config.ASM_BATCH_SIZE;
			const __OFFSET__ = i * config.ASM_BATCH_SIZE;

			const dynamicUrlPart = config.ASM_EP_RES_FLT.replace('__RESOURCE_NAME__', ressourceName).replace('__LIMIT__', __LIMIT__).replace('__OFFSET__', __OFFSET__);

			const URL = staticUrlPart + dynamicUrlPart;

			winston.info(`Fetching ASM data using ${URL} ...`);

			const headers = {
				Authorization: `Basic ${config.TOKEN}`,
				'X-TenantID': config.X_TENANT_ID,
			};

			try {
				const response = await axios.get(URL, {
					timeout: config.ASM_RESPONSE_TIMEOUT,
					headers: headers,
				});

				winston.info(`Received data.`);

				if (response.data && response.data._items) {
					for (let item of response.data._items) {
						asmEntities[item._id] = item.uniqueId;
					}
					winston.info(`Done collecting batched data from ASM. Found ${response.data._items.length} items in current batch.`);
				}
			} catch (error) {
				winston.error(error.stack);
				reject(error);
			}
		}

		winston.info(`Done collecting ALL data from ASM. Found ${Object.keys(asmEntities).length} items.`);
		resolve(asmEntities);
	});
}

function collectSmonData(networkDevicesASM) {
	return new Promise(async (resolve, reject) => {
		let connection;
		console.log(networkDevicesASM);
		try {
			connection = await oracledb.getConnection({
				user: config.SMON_DB_USER,
				password: config.SMON_DB_PW,
				connectString: config.SMON_DB_CONNECT_STRING,
			});

			const connectivityServices = [];
			const connectivityServiceQuery = config.CONNECTIVITY_SERVICE_QUERY.replaceAll('__SMONELEMENTTYPE_DB_NAME__', config.SMONELEMENTTYPE_DB_NAME).replaceAll('__SMONELEMENT_DB_NAME__', config.SMONELEMENT_DB_NAME);

			winston.info('Fetching connectivity services using query ' + connectivityServiceQuery);

			const connectivityServiceResult = await connection.execute(connectivityServiceQuery, [], {
				resultSet: true,
			});

			winston.info('Connectivity services fetched successfully. ');
			winston.info('Preparing connectivity services for ASM ...');
			let connectivityServiceRow;
			while ((connectivityServiceRow = await connectivityServiceResult.resultSet.getRow())) {
				const connectivityService = JSON.parse(JSON.stringify(connectivityServiceRow));

				for (let col in connectivityService) {
					connectivityService[col.toLowerCase()] = connectivityService[col];
					delete connectivityService[col];
				}

				connectivityService.entityTypes = [config.ASM_TYPE_CONNECTIVITY_SERVICE];
				connectivityService.ele_type_name = config.ASM_TYPE_CONNECTIVITY_SERVICE;
				connectivityService.uniqueId = connectivityService.ele_name;
				connectivityService.name = connectivityService.ele_name;

				const duplicate = connectivityServices.find((ele) => ele.ele_name === connectivityService.ele_name);
				if (!duplicate) {
					connectivityServices.push(connectivityService);
				}
			}
			winston.info('Successfully prepared connectivity services for ASM.');

			const relationQuery = config.RELATION_QUERY.replaceAll('__SMONELEMENT_DB_NAME__', config.SMONELEMENT_DB_NAME)
				.replaceAll('__SMONATTRIBUT_DB_NAME__', config.SMONATTRIBUT_DB_NAME)
				.replaceAll('__SMONELEMENTTYPE_DB_NAME__', config.SMONELEMENTTYPE_DB_NAME)
				.replaceAll('__SMONRELATION_DB_NAME__', config.SMONRELATION_DB_NAME)
				.replaceAll('__INVENTORY_DB_NAME__', config.INVENTORY_DB_NAME);

			winston.info('Fetching Relations using query ' + relationQuery);

			const relationResult = await connection.execute(relationQuery, [], {
				resultSet: true,
			});
			winston.info('Relations fetched successfully.');

			if (!relationResult) {
				winston.error('Did not get any results from database!');
				reject('Did not get any results from database!');
				return;
			}

			const relationRs = relationResult.resultSet;
			let row;
			let i = 0;
			const relations = [];
			const missingNetworkDevices = [];
			let araCounter = 0;
			let peCounter = 0;

			winston.info('Preparing relation data for API ...');
			while ((row = await relationRs.getRow())) {
				i++;
				if (!networkDevicesASM.includes(row.CHILD_IP)) {
					// winston.warn(`ASM NetworkDevices DON'T include ${row.CHILD_IP}, can't insert SMON data ${JSON.stringify(row, null, 2)} `);
					missingNetworkDevices.push(row.CHILD_IP);
					continue;
				}
				const parentEleName = row.PATH.split('|_|')[1];
				const relation = {
					_fromUniqueId: parentEleName,
					_toUniqueId: row.CHILD_IP,
					_edgeType: 'runsOn',
				};
				const duplicate = relations.find((existingRelation) => JSON.stringify(existingRelation) === JSON.stringify(relation));

				if (!duplicate) {
					relations.push(relation);
					if (/.{2,}ARA/.test(row.ELE_LABEL)) araCounter++;
					else if (/.{2,}PE/.test(row.ELE_LABEL)) peCounter++;
				}
			}

			if (missingNetworkDevices.length > 0) {
				winston.warn(`${missingNetworkDevices.length} relations can't be inserted into ASM due to missing network devices.`);
			}
			winston.info(`${relations.length} relations were found in SMON data and ASM contains matching network devices.`);
			winston.info(`Relations between connectivity services and ara devices: ${araCounter}`);
			winston.info(`Relations between connectivity services and pe devices:  ${peCounter}`);
			winston.info(`${connectivityServices.length} connectivity services were found in SMON data.`);

			resolve({ connectivityServices, relations });
		} catch (error) {
			console.log(error);
			reject(error);
		} finally {
			if (connection) {
				try {
					await connection.close();
				} catch (err) {
					console.log(err);
				}
			}
		}
	});
}

function sendToAsm(connectivityServices, relations) {
	return new Promise(async (resolve, reject) => {
		winston.info('Inserting connectivity services ...');

		let connectivityServiceCount = 1;

		for (const connectivityService of connectivityServices) {
			try {
				winston.info(`Working on connectivity service ${connectivityService.uniqueId}. This is element #${connectivityServiceCount}.`);
				connectivityServiceCount++;
				await sendSingleElementToAsm(connectivityService, config.ASM_EP_RES);
			} catch (error) {
				winston.info('Caught an exception while sending data to ASM!');
				winston.error(error.stack);
				console.log(error);
			}
		}

		winston.info('Inserting relations ...');

		let relationCount = 1;

		for (const relation of relations) {
			try {
				winston.info(`Working on relation for element ${relation._fromUniqueId}. This is element #${relationCount}.`);
				relationCount++;
				await sendSingleElementToAsm(relation, config.ASM_EP_REF);
			} catch (error) {
				winston.info('Caught an exception while sending data to ASM!');
				winston.error(error.stack);
			}
		}
		resolve();
	});
}

async function sendSingleElementToAsm(ele, endpoint) {
	return new Promise(async function (resolve, reject) {
		try {
			const headers = {
				Authorization: `Basic ${config.TOKEN}`,
				'X-TenantID': config.X_TENANT_ID,
				JobId: config.ASM_EP_JOB_ID,
			};
			const URL = config.ASM_BASE_URL + config.ASM_REST_PATH + endpoint;

			winston.info(`Sending ele ${JSON.stringify(ele, null, 2)} with headers ${JSON.stringify(headers, null, 2)} to asm using URL ${URL}`);

			await axios.post(URL, ele, {
				timeout: config.ASM_RESPONSE_TIMEOUT,
				headers: headers,
			});

			winston.info('Sent to ASM.');

			resolve();
		} catch (error) {
			winston.error('Error sending the following data to ASM:');
			winston.info(JSON.stringify(ele, null, 2));
			winston.error(error.stack);
			console.log(error);
			resolve();
		}
	});
}

function syncAsm(connectivityServicesASM, connectivityServicesSMON) {
	// connectivityServicesASM:  Object with keys: _id and value:  uniqueId
	// connectivityServicesSMON: Array objects, object containing: uniqueId
	return new Promise(async (resolve, reject) => {
		winston.info('Preparing connectivity services, which need to be removed from ASM ...');
		const connectivityServicesToBeDeleted = [];

		for (let [ASM_id, ASMuniqueId] of Object.entries(connectivityServicesASM)) {
			if (!connectivityServicesSMON.find((SMONService) => SMONService.uniqueId === ASMuniqueId)) {
				winston.info(`Connectivity service with _id ${ASM_id} and uniqueId ${ASMuniqueId} was not found in SMON data ...`);
				connectivityServicesToBeDeleted.push(ASM_id);
			}
		}

		for (let _id of connectivityServicesToBeDeleted) {
			const uri = encodeURI(config.ASM_BASE_URL + config.ASM_TOPO_PATH + config.ASM_EP_RES + '/' + _id);

			winston.debug(`Deleting ressource with _id ${_id}, using URI  ${uri}`);

			try {
				await axios.delete(uri, {
					headers: {
						Authorization: `Basic ${config.TOKEN}`,
						'X-TenantID': config.X_TENANT_ID,
					},
				});
				winston.debug(`Successfully deleted ressource with _id ${_id}`);
				winston.info('----------------------');
			} catch (error) {
				winston.error(`an error occurred when deleting ressource with _id ${_id}, ${error.message}`);
			}
		}

		winston.info('Setting 6s timeout ...');

		await new Promise((resolve, _) =>
			setTimeout(() => {
				resolve();
			}, 6000)
		);

		for (let _id of connectivityServicesToBeDeleted) {
			const uri = encodeURI(config.ASM_BASE_URL + config.ASM_TOPO_PATH + config.ASM_EP_RES + '/' + _id + config.ASM_EP_RES_DEL_IMMEDIATE_PARAM);

			winston.debug(`Deleting ressource with _id ${_id} for good, using URI ${uri}`);

			try {
				await axios.delete(uri, {
					headers: {
						Authorization: `Basic ${config.TOKEN}`,
						'X-TenantID': config.X_TENANT_ID,
					},
				});
				winston.debug(`Successfully deleted ressource with _id ${_id} for good`);
				winston.info('----------------------');
			} catch (error) {
				winston.error(`an error occurred when deleting ressource with _id ${_id}, ${error.message}`);
			}
		}
		resolve();
	});
}

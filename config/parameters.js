const winston = require('winston');

const defaultParams = {
	ASM_BATCH_SIZE: 3000,
	TOKEN: 'b2Etbm9pLWh5YnJpZC10b3BvbG9neS1vYS1ub2ktaHlicmlkLXVzZXI6T0Z6WHRKaUo2M1hSYWdNSlhwaWsycmhRT3RMbGxYTUtJckV6cHhEcUNPbz0=',
	ASM_RESPONSE_TIMEOUT: 240000,
	ASM_EP_JOB_ID: 'snr_inventory',
	ASM_EP_RES: 'resources',
	ASM_EP_REF: 'references',
	ASM_TYPE_NETWORK_DEVICE: 'networkDevice',
	ASM_TYPE_CONNECTIVITY_SERVICE: 'connectivityService',
	SMONELEMENT_DB_NAME: 'SMONELEMENT',
	SMONELEMENTTYPE_DB_NAME: 'SMONELEMENTTYPE',
	SMONATTRIBUT_DB_NAME: 'SMONATTRIBUT',
	SMONRELATION_DB_NAME: 'SMONRELATION',
	INVENTORY_DB_NAME: 'INVENTORY',
	SMON_DB_USER: 'sunrise',
	SMON_DB_PW: 'oadvice',
	SMON_DB_CONNECT_STRING: '(DESCRIPTION =(ADDRESS = (PROTOCOL = TCP)(HOST = 192.168.12.189)(PORT = 1521))(CONNECT_DATA =(SID= ORCL)))',
	ASM_BASE_URL: 'https://oa-noi-hybrid-topology.oa-noi-hybrid.apps.ocp-demo.int.openadvice.de',
	ASM_REST_PATH: '/1.0/rest-observer/rest/',
	ASM_TOPO_PATH: '/1.0/topology/',
	ASM_EP_RES_FLT:
		'?_type=__RESOURCE_NAME__&_limit=__LIMIT__&_offset=__OFFSET__&_sort=+uniqueId&_field=uniqueId&_include_global_resources=false&_include_count=false&_include_status=false&_include_status_severity=false&_include_metadata=false&_return_composites=true',
	ASM_EP_RES_CNT: '?_type=__RESOURCE_TYPE__&_limit=1&_include_global_resources=false&_include_count=true&_include_status=false&_include_status_severity=false&_include_metadata=false&_return_composites=true',
	// RELATION_QUERY:
	// 	"select PC.rel_id, SL1.ele_name as parent_ele_name, PC.child_id, SL2.ele_name as child_ele_name, INV.IP as child_ip from ( select rel_id, parent_id, child_id, LEVEL as depth FROM smonrelation CONNECT BY PRIOR child_id = parent_id  START WITH parent_id in (select se.ele_id from __SMONELEMENT_DB_NAME__ SE join __SMONELEMENTTYPE_DB_NAME__ ST on SE.ele_type = ST.type_id where ST.type_name = 'ConnectivityService' ) ) PC join __SMONELEMENT_DB_NAME__ SL1 on PC.parent_id = SL1.ELE_ID join ( select * from __SMONELEMENT_DB_NAME__ SMONEL2 JOIN __SMONELEMENTTYPE_DB_NAME__ SET2 on SMONEL2.ELE_TYPE = SET2.TYPE_ID ) SL2  on PC.child_id = SL2.ele_id join  __SMONATTRIBUT_DB_NAME__ SAT on PC.child_id = SAT.ele_id join INVENTORY INV on SAT.att_value = INV.SMON_TAG where PC.depth = 2 and SL2.TYPE_NAME in ('SER','EDGE','Access')",
	RELATION_QUERY: `
      select 
        PC.path,
        INV.IP as child_ip,
        PC.depth,
        SL2.ele_label
      from 
        (
          select 
            SL1.ele_name as parent_ele_name, 
            rel_id, 
            parent_id, 
            child_id, 
            LEVEL as depth, 
            SYS_CONNECT_BY_PATH(SL1.ele_name, '|_|') as path         
          from __SMONRELATION_DB_NAME__ SR1
          join __SMONELEMENT_DB_NAME__ SL1 
          on SR1.parent_id = SL1.ELE_ID
          where connect_by_isleaf = 1
          CONNECT BY PRIOR child_id = parent_id  START WITH parent_id in 
            (
              select se.ele_id from __SMONELEMENT_DB_NAME__ SE 
              join __SMONELEMENTTYPE_DB_NAME__ ST 
              on SE.ele_type = ST.type_id 
              where ST.type_name = 'ConnectivityService'
            )
        ) PC
      join
        (
          select * from __SMONELEMENT_DB_NAME__ SMONEL2 JOIN __SMONELEMENTTYPE_DB_NAME__ SET2 on SMONEL2.ELE_TYPE = SET2.TYPE_ID
        ) SL2  
      on PC.child_id = SL2.ELE_ID
      join __SMONATTRIBUT_DB_NAME__ SAT 
      on PC.child_id = SAT.ele_id
      join __INVENTORY_DB_NAME__ INV 
      on SAT.att_value = INV.SMON_TAG
      where PC.depth = 2 
      and SL2.TYPE_NAME in ('SER','EDGE','Access')`,
	CONNECTIVITY_SERVICE_QUERY:
		"select SE.ELE_NAME ELE_NAME, SE.ELE_ID ELE_ID, SE.ELE_TYPE ELE_TYPE, SE.ELE_STATUS ELE_STATUS, SE.ELE_LABEL ELE_LABEL, SE.ELE_EVT_STATUS ELE_EVT_STATUS from __SMONELEMENT_DB_NAME__ SE join __SMONELEMENTTYPE_DB_NAME__ ST on SE.ele_type = ST.type_id where ST.type_name = 'ConnectivityService'",
	X_TENANT_ID: 'cfd95b7e-3bc7-4006-a4a8-a73a79c71255',
	ASM_EP_RES_DEL_IMMEDIATE: 'true',
	ASM_EP_RES_DEL_IMMEDIATE_PARAM: '?_immediate=true',
	ASM_EP_DEL_WAIT_TIME_MS: 3000,
};

const params = {};
for (let [PARAM, DEFAULT_VALUE] of Object.entries(defaultParams)) {
	if (!process.env[PARAM]) winston.warn(`Missing env variable ${PARAM}! Using default value: ${DEFAULT_VALUE}`);
	if (typeof DEFAULT_VALUE === 'number') {
		if (process.env[PARAM]) {
			params[PARAM] = JSON.parse(process.env[PARAM]);
		} else {
			params[PARAM] = DEFAULT_VALUE;
		}
	} else {
		params[PARAM] = process.env[PARAM] || DEFAULT_VALUE;
	}
}
console.log(params);

module.exports = params;

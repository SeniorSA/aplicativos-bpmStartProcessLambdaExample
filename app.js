const axios = require('axios')

const createResponse = (statusCode, message, processInstanceId) => ({
    statusCode,
    body: JSON.stringify({ type: 'PLAINTEXT', text: [ message ], processInstanceId: processInstanceId })
});

const execute = async event => {
    
    const auth = event.headers['Authorization'];
    if (!auth) {
        return createResponse(401, 'No authorization provided.');
    }

    console.log(event.body);
    console.log(JSON.parse(event.body));

    const { 
        processId, 
        action, 
        nextResponsible,
        outputMessage,
        ...data
    } = JSON.parse(event.body || '{}');

    if (!processId) {
        return createResponse(400, 'processId is required.');
    }

    const config = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': auth
        }
    }

    console.log('antes de getFormAccessProperties');

    const getFormAccessPropertiesParams = {
        processId,
        processState: 'New',
        authorization: auth
    };
    const { data: { accessPropertiesResponse } } = await axios.get(`${process.env.PLATFORM_URL}/rest/platform/workflow/queries/getFormAccessProperties`, {
        params: getFormAccessPropertiesParams,
        ...config,
    });

    console.log('antes de getNextProcessInstanceId');

    const { data: { processInstanceID } } = await axios.get(`${process.env.PLATFORM_URL}/rest/platform/workflow/queries/getNextProcessInstanceId`, config);

    console.log('antes de ecm_form');

    if (accessPropertiesResponse.performerURI === 'com.senior.wfe.EcmForm') {
        const ecmConfig = JSON.parse(accessPropertiesResponse.performerData);
        const createEcmRecordParam = {
            ...data,
            processInstanceId: processInstanceID
        }
        console.log(createEcmRecordParam);
        await axios.post(`${process.env.PLATFORM_URL}/odata/platform/ecm_form/${ecmConfig.entityName}`, createEcmRecordParam, config);
    }

    const startProcessParams = {
        processInstanceID,
        processId,
        businessData: JSON.stringify({ root: data }),
        authorization: auth,
        flowExecutionData: {
            actionToExecute: action,
            nextSubject: nextResponsible || null
        }
    };

    console.log('antes de startProcess');
    
    await axios.post(`${process.env.PLATFORM_URL}/rest/platform/workflow/actions/startProcess`, startProcessParams, config);
    
    console.log(`Process instance with id ${processInstanceID} started.`);
    return createResponse(200, outputMessage || 'Processo iniciado.', processInstanceID);
}

exports.lambdaHandler = async (event) => {
    console.log(event);
    try {
        return await execute(event);
    } catch (err) {
        console.log(err);
        const errorStatusCode = (err.response && err.response.status) || 500;
        const errorMsg = (err.data && err.data.message) || 'ERROR';
        return createResponse(errorStatusCode, errorMsg);
    }
};
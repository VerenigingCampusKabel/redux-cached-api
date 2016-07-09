import fetch from 'isomorphic-fetch';

import {RequestError, InternalError} from './errors';
import {CALL_API, INVALID_REQUEST} from './types';
import {VALID_REQUEST_PROPERTIES} from './validation';

const actionWith = async (action, endpoint, ...args) => {
    // Only execute payload function on response action types
    if (!action.payload) {
        try {
            action.payload = await endpoint.payload(...args);
        } catch (err) {
            action.error = true;
            action.payload = new InternalError(err.message);
        }
    }

    return action;
};

// TODO: pass along payload from action to endpoint/defaults properties
// TODO: allow custom requests (without endpoint) using CALL_API
// TODO: deal with models (append model name to action types)
// TODO: bailout / caching

const createApiMiddleware = (config) => {
    return ({getState, dispatch}) => {
        return (next) => async (action) => {
            // Do not procecss actions without a CALL_API property
            if (!action[CALL_API]) {
                return next(action);
            }

            // Validate endpoint
            const {model: modelName, endpoint: endpointName} = action[CALL_API];
            if (!endpointName || (typeof endpointName === 'string' && !config.endpoints[endpointName])) {
                next(await actionWith({
                    type: INVALID_REQUEST,
                    error: true,
                    payload: new RequestError(`Invalid endpoint: ${endpointName}`)
                }, endpointName, getState(), dispatch));
            }
            if (typeof endpointName === 'string' && (!modelName || !config.models[modelName])) {
                next(await actionWith({
                    type: INVALID_REQUEST,
                    error: true,
                    payload: new RequestError(`Invalid endpoint model (${modelName}) on ${endpointName}`)
                }, endpointName, getState(), dispatch));
            }

            // Fetch endpoint and model configuration
            const endpoint = typeof endpointName === 'object' ? endpointName : config.endpoints[endpointName];
            const model = typeof endpointName === 'object' ? null : config.models[modelName];

            // Generate the request configuration
            const request = {};
            try {
                for (const property of VALID_REQUEST_PROPERTIES) {
                    if (endpoint[property]) {
                        request[property] = endpoint[property]();
                    } else if (config.defaults[property]) {
                        request[property] = config.defaults[property]();
                    }
                }

                // Normalize url
                if (request.url.chartAt(0) !== '/') {
                    request.url = '/' + request.url;
                }

                // Append API and model url prefixes
                request.url = config.url + '/' + model.url + request.url;
            } catch (err) {
                // An error occurred when executing an endpoint property function
                next(await actionWith({
                    type: endpoint.actionTypes.REQUEST,
                    error: true,
                    payload: new InternalError(err.message)
                }, endpoint, getState(), dispatch));
            }

            // Dispatch request action type
            next(await actionWith({
                type: endpoint.actionTypes.REQUEST,
                error: false
            }, endpoint, getState()));

            try {
                // Make the API call
                const result = await fetch(request.url, request);

                // The server responded with a status code outside the 200-299 range
                if (!result.ok) {
                    return next(await actionWith({
                        type: endpoint.actionTypes.FAILED,
                        error: true
                    }, endpoint, getState(), dispatch, result));
                }

                // The request was successful
                return next(await actionWith({
                    type: endpoint.actionTypes.SUCCESS,
                    error: false
                }, endpoint, getState(), dispatch, result));
            } catch (err) {
                // The request was invalid or a network error occurred
                return next(await actionWith({
                    type: endpoint.actionTypes.FAILED,
                    error: true,
                    payload: new RequestError(err.message)
                }, endpoint, getState(), dispatch));
            }
        };
    };
};

export default createApiMiddleware;
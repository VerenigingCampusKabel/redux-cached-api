import {decamelize} from 'humps';
import {isUri} from 'valid-url';

import {InvalidConfigError} from './errors';
import {validateEntity} from './validation';

/**
 * Define an API
 *
 * @param {object} config API configuration
 * @return {object} API definition
 */
export const createApi = (config) => {
    // Validate API name
    if (config.name && typeof config.name !== 'string') {
        throw new InvalidConfigError('Invalid API name: ' + config.name);
    }

    // Enforce upper camelcase
    const name = config.name ? decamelize(config.name).toUpperCase() : 'API';

    // Validate API base url
    if (!config.url) {
        throw new InvalidConfigError('Missing API base url');
    }
    if (typeof config.url !== 'string') {
        throw new InvalidConfigError(`Invalid API base url: ${config.url}`);
    }
    if (!isUri(config.url)) {
        throw new InvalidConfigError(`Invalid API base url: ${config.url}`);
    }

    // Trim url and remove possible trailing slash
    let url = config.url.trim();
    if (url.charAt(url.length - 1) === '/') {
        url = url.substring(0, url.length - 1);
    }

    // Validate entities
    if (config.entities) {
        Object.values(config.entities).forEach((entity) => validateEntity(entity));
    }

    return {
        name,
        url,
        entities: config.entities || {}
    };
};

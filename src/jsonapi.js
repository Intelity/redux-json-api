import { createAction, handleActions } from 'redux-actions';
import 'fetch-everywhere';
import imm from 'object-path-immutable';

import {
  addLinksToState,
  removeResourceFromState,
  updateOrInsertResourcesIntoState,
  setIsInvalidatingForExistingResource,
  ensureResourceTypeInState
} from './state-mutation';
import { apiRequest, noop, jsonContentTypes } from './utils';
import {
  API_SET_ENDPOINT_HOST, API_SET_ENDPOINT_PATH, API_SET_HEADERS, API_SET_HEADER, API_WILL_CREATE,
  API_CREATED, API_CREATE_FAILED, API_WILL_READ, API_READ, API_READ_FAILED, API_WILL_UPDATE,
  API_UPDATED, API_UPDATE_FAILED, API_WILL_DELETE, API_DELETED, API_DELETE_FAILED, API_CLEAR
} from './constants';

// Resource isInvalidating values
export const IS_DELETING = 'IS_DELETING';
export const IS_UPDATING = 'IS_UPDATING';

// Action creators
export const setEndpointHost = createAction(API_SET_ENDPOINT_HOST);
export const setEndpointPath = createAction(API_SET_ENDPOINT_PATH);
export const setHeaders = createAction(API_SET_HEADERS);
export const setHeader = createAction(API_SET_HEADER);

const apiWillCreate = createAction(API_WILL_CREATE);
const apiCreated = createAction(API_CREATED);
const apiCreateFailed = createAction(API_CREATE_FAILED);

const apiWillRead = createAction(API_WILL_READ);
const apiRead = createAction(API_READ);
const apiReadFailed = createAction(API_READ_FAILED);

const apiWillUpdate = createAction(API_WILL_UPDATE);
const apiUpdated = createAction(API_UPDATED);
const apiUpdateFailed = createAction(API_UPDATE_FAILED);

const apiWillDelete = createAction(API_WILL_DELETE);
const apiDeleted = createAction(API_DELETED);
const apiDeleteFailed = createAction(API_DELETE_FAILED);

// Actions
export const setAccessToken = (at) => {
  return (dispatch) => {
    dispatch(setHeader({ Authorization: `Bearer ${at}` }));
  };
};

export const uploadFile = (file, {
  companyId,
  fileableType: fileableType = null,
  fileableId: fileableId = null
}, {
  onSuccess: onSuccess = noop,
  onError: onError = noop
} = {}) => {
  console.warn('uploadFile has been deprecated and will no longer be supported by redux-json-api https://github.com/dixieio/redux-json-api/issues/2');

  return (dispatch, getState) => {
    const accessToken = getState().api.endpoint.accessToken;
    const path = [companyId, fileableType, fileableId].filter(o => !!o).join('/');
    const url = `${__API_HOST__}/upload/${path}?access_token=${accessToken}`;

    const data = new FormData;
    data.append('file', file);

    const options = {
      method: 'POST',
      body: data
    };

    return fetch(url, options)
      .then(res => {
        if (res.status >= 200 && res.status < 300) {
          if (jsonContentTypes.some(contentType => res.headers.get('Content-Type').indexOf(contentType) > -1)) {
            return res.json();
          }

          return res;
        }

        const e = new Error(res.statusText);
        e.response = res;
        throw e;
      })
      .then(json => {
        onSuccess(json);
      })
      .catch(error => {
        onError(error);
      });
  };
};

export const createResource = (resource, {
  onSuccess: onSuccess = noop,
  onError: onError = noop,
  endpoint: endpointOverride = undefined,
  headers: headersOverride = {},
  wrapData: wrapDataOverride = true,
  options,
} = {}) => {
  if (onSuccess !== noop || onError !== noop) {
    console.warn('onSuccess/onError callbacks are deprecated. Please use returned promise: https://github.com/dixieio/redux-json-api/issues/17');
  }

  return (dispatch, getState) => {
    const { host: apiHost, path: apiPath, headers } = getState().api.endpoint;
    let endpoint = `${resource.type}`;
    if (endpointOverride !== undefined) {
      endpoint = endpointOverride;
    }
    const apiEndpoint = `${apiHost}${apiPath}/${endpoint}`;
    dispatch(apiWillCreate({ resource, endpoint, options }));

    let body = {
      data: resource
    };
    if (wrapDataOverride === false) {
      body = resource;
    }

    return new Promise((resolve, reject) => {
      apiRequest(apiEndpoint, {
        headers: Object.assign({}, headers, headersOverride),
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(body)
      }).then(json => {
        dispatch(apiCreated({ resource: json, endpoint, options }));
        onSuccess(json);
        resolve(json);
      }).catch(error => {
        const err = error;
        err.resource = resource;
        err.endpoint = endpoint;
        err.options = options;

        dispatch(apiCreateFailed(err));
        onError(err);
        reject(err);
      });
    });
  };
};

export const readEndpoint = (endpoint, {
  onSuccess: onSuccess = noop,
  onError: onError = noop,
  headers: headersOverride = {},
  wrapData: wrapDataOverride = true,
  options = {
    indexLinks: undefined,
    retries: 0,
    retryDelay: 1000,
  },
} = {}) => {
  if (onSuccess !== noop || onError !== noop) {
    console.warn('onSuccess/onError callbacks are deprecated. Please use returned promise: https://github.com/dixieio/redux-json-api/issues/17');
  }
  return (dispatch, getState) => {
    dispatch(apiWillRead({ endpoint, options }));

    const { host: apiHost, path: apiPath, headers } = getState().api.endpoint;
    const apiEndpoint = `${apiHost}${apiPath}/${endpoint}`;

    return new Promise((resolve, reject) => {
      apiRequest(apiEndpoint, {
        headers: Object.assign({}, headers, headersOverride),
        credentials: 'include',
        retries: options.retries,
        retryDelay: options.retryDelay,
      })
        .then(json => {
          dispatch(apiRead({ endpoint, options, resource: json }));
          onSuccess(json);
          resolve(json);
        })
        .catch(error => {
          const err = error;
          err.endpoint = endpoint;
          err.options = options;

          dispatch(apiReadFailed(err));
          onError(err);
          reject(err);
        });
    });
  };
};

export const updateResource = (resource, {
  onSuccess: onSuccess = noop,
  onError: onError = noop,
  endpoint: endpointOverride = undefined,
  headers: headersOverride = {},
  wrapData: wrapDataOverride = true,
  options,
} = {}) => {
  if (onSuccess !== noop || onError !== noop) {
    console.warn('onSuccess/onError callbacks are deprecated. Please use returned promise: https://github.com/dixieio/redux-json-api/issues/17');
  }
  return (dispatch, getState) => {

    const { host: apiHost, path: apiPath, headers } = getState().api.endpoint;
    let endpoint = `${resource.type}/${resource.id}`;
    if (endpointOverride !== undefined) {
      endpoint = endpointOverride;
    }
    const apiEndpoint = `${apiHost}${apiPath}/${endpoint}`;
    dispatch(apiWillUpdate({ resource, endpoint, options }));

    let body = {
      data: resource
    };
    if (wrapDataOverride === false) {
      body = resource;
    }

    return new Promise((resolve, reject) => {
      apiRequest(apiEndpoint, {
        headers: Object.assign({}, headers, headersOverride),
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify(body)
      }).then(json => {
        dispatch(apiUpdated({ resource: json, endpoint, options }));
        onSuccess(json);
        resolve(json);
      }).catch(error => {
        const err = error;
        err.resource = resource;
        err.endpoint = endpoint;
        err.options = options;

        dispatch(apiUpdateFailed(err));
        onError(err);
        reject(err);
      });
    });
  };
};

export const deleteResource = (resource, {
  onSuccess: onSuccess = noop,
  onError: onError = noop,
  endpoint: endpointOverride = undefined,
  headers: headersOverride = {},
  wrapData: wrapDataOverride = true,
  options,
} = {}) => {
  if (onSuccess !== noop || onError !== noop) {
    console.warn('onSuccess/onError callbacks are deprecated. Please use returned promise: https://github.com/dixieio/redux-json-api/issues/17');
  }

  return (dispatch, getState) => {

    const { host: apiHost, path: apiPath, headers } = getState().api.endpoint;
    let endpoint = `${resource.type}/${resource.id}`;
    if (endpointOverride !== undefined) {
      endpoint = endpointOverride;
    }
    const apiEndpoint = `${apiHost}${apiPath}/${endpoint}`;
    dispatch(apiWillDelete({ resource, endpoint, options }));

    return new Promise((resolve, reject) => {
      apiRequest(apiEndpoint, {
        headers: Object.assign({}, headers, headersOverride),
        method: 'DELETE',
        credentials: 'include'
      }).then(() => {
        dispatch(apiDeleted({ resource, endpoint, options }));
        onSuccess();
        resolve();
      }).catch(error => {
        const err = error;
        err.resource = resource;
        err.endpoint = endpoint;
        err.options = options;

        dispatch(apiDeleteFailed(err));
        onError(err);
        reject(err);
      });
    });
  };
};

export const requireResource = (resourceType, endpoint = resourceType, {
  onSuccess: onSuccess = noop,
  onError: onError = noop,
  headers: headersOverride = {},
  wrapData: wrapDataOverride = true,
  options,
} = {}) => {
  if (onSuccess !== noop || onError !== noop) {
    console.warn('onSuccess/onError callbacks are deprecated. Please use returned promise: https://github.com/dixieio/redux-json-api/issues/17');
  }

  return (dispatch, getState) => {
    return new Promise((resolve, reject) => {
      const { api } = getState();
      if (api.hasOwnProperty(resourceType)) {
        resolve();
        return onSuccess();
      }

      dispatch(readEndpoint(endpoint, { onSuccess, onError, headersOverride, wrapDataOverride, options }))
        .then(resolve)
        .catch(reject);
    });
  };
};

export const createEntity = (...args) => {
  console.warn('createEntity is deprecated and will be removed in v2.0 in favor of new method createResource');
  return createResource(...args);
};

export const updateEntity = (...args) => {
  console.warn('updateEntity is deprecated and will be removed in v2.0 in favor of new method updateResource');
  return updateResource(...args);
};

export const deleteEntity = (...args) => {
  console.warn('deleteEntity is deprecated and will be removed in v2.0 in favor of new method deleteResource');
  return deleteResource(...args);
};

export const requireEntity = (...args) => {
  console.warn('requireEntity is deprecated and will be removed in v2.0 in favor of new method requireResource');
  return requireResource(...args);
};

// Reducers
export const reducer = handleActions({

  [API_SET_HEADERS]: (state, { payload: headers }) => {
    return imm(state).set(['endpoint', 'headers'], headers).value();
  },

  [API_SET_HEADER]: (state, { payload: header }) => {
    const newState = imm(state);
    Object.keys(header).forEach(key => {
      newState.set(['endpoint', 'headers', key], header[key]);
    });

    return newState.value();
  },

  [API_SET_ENDPOINT_HOST]: (state, { payload: host }) => {
    return imm(state).set(['endpoint', 'host'], host).value();
  },

  [API_SET_ENDPOINT_PATH]: (state, { payload: path }) => {
    return imm(state).set(['endpoint', 'path'], path).value();
  },

  [API_WILL_CREATE]: (state) => {
    return imm(state).set(['isCreating'], state.isCreating + 1).value();
  },

  [API_CREATED]: (state, { payload: { resource: resources } }) => {
    const entities = Array.isArray(resources.data) ? resources.data : [resources.data];

    const newState = updateOrInsertResourcesIntoState(
      state,
      entities.concat(resources.included || [])
    );

    return imm(newState)
      .set('isCreating', state.isCreating - 1)
      .value();
  },

  [API_CREATE_FAILED]: (state) => {
    return imm(state).set(['isCreating'], state.isCreating - 1).value();
  },

  [API_WILL_READ]: (state) => {
    return imm(state).set(['isReading'], state.isReading + 1).value();
  },

  [API_READ]: (state, { payload: { resource } }) => {
    const resources = (
      Array.isArray(resource.data)
        ? resource.data
        : [resource.data]
    ).concat(resource.included || []);

    const newState = updateOrInsertResourcesIntoState(state, resources);
    const finalState = addLinksToState(newState, resource.links, resource.options);

    return imm(finalState)
      .set('isReading', state.isReading - 1)
      .value();
  },

  [API_READ_FAILED]: (state) => {
    return imm(state).set(['isReading'], state.isReading - 1).value();
  },

  [API_WILL_UPDATE]: (state, { payload: { resource } }) => {
    const { type, id } = resource;

    const newState = ensureResourceTypeInState(state, type);

    return setIsInvalidatingForExistingResource(newState, { type, id }, IS_UPDATING)
      .set('isUpdating', state.isUpdating + 1)
      .value();
  },

  [API_UPDATED]: (state, { payload: { resource: resources } }) => {
    const entities = Array.isArray(resources.data) ? resources.data : [resources.data];

    const newState = updateOrInsertResourcesIntoState(
      state,
      entities.concat(resources.included || [])
    );

    return imm(newState)
      .set('isUpdating', state.isUpdating - 1)
      .value();
  },

  [API_UPDATE_FAILED]: (state, { payload: { resource } }) => {
    const { type, id } = resource;

    return setIsInvalidatingForExistingResource(state, { type, id }, IS_UPDATING)
      .set('isUpdating', state.isUpdating + 1)
      .value();
  },

  [API_WILL_DELETE]: (state, { payload: { resource } }) => {
    const { type, id } = resource;

    return setIsInvalidatingForExistingResource(state, { type, id }, IS_DELETING)
      .set('isDeleting', state.isDeleting + 1)
      .value();
  },

  [API_DELETED]: (state, { payload: { resource } }) => {
    return removeResourceFromState(state, resource)
      .set('isDeleting', state.isDeleting - 1)
      .value();
  },

  [API_DELETE_FAILED]: (state, { payload: { resource } }) => {
    const { type, id } = resource;

    return setIsInvalidatingForExistingResource(state, { type, id }, IS_DELETING)
      .set('isDeleting', state.isDeleting + 1)
      .value();
  },

  [API_CLEAR]: (state, { payload: { resource } }) => {
    const { type } = resource;
    const newState = Object.assign({}, state);

    if ({}.hasOwnProperty.call(newState, type) === true) {
      delete newState[type];
    }

    return imm(newState)
      .value();
  },

}, {
  isCreating: 0,
  isReading: 0,
  isUpdating: 0,
  isDeleting: 0,
  endpoint: {
    host: null,
    path: null,
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json'
    }
  }
});

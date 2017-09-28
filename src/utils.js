export const jsonContentTypes = [
  'application/json',
  'application/vnd.api+json'
];

// retry code modeled after: https://github.com/jonbern/fetch-retry/blob/52ffdb566c7d2238c35022d29dca3ce3d5b77750/index.js

export const noop = () => {};

export const apiRequest = (url, options = {}) => {
  let retries = 0;
  let retryDelay = 1000;

  if (options && options.retries) {
    retries = options.retries;
  }

  if (options && options.retryDelay) {
    retryDelay = options.retryDelay;
  }

  return new Promise((resolve, reject) => {
    const wrappedFetch = (n) => {
      fetch(url, options)
        .then(res => {
          if (res.status >= 200 && res.status < 300) {
            if (res.status === 204) {
              resolve(res);
            } else if (jsonContentTypes.some(contentType => res.headers.get('Content-Type').indexOf(contentType) > -1)) {
              resolve(res.json());
            }
          }

          if (n > 0) {
            setTimeout(() => {
              wrappedFetch((n - 1));
            }, retryDelay);
          } else {
            const e = new Error(res.statusText);
            e.response = res;
            throw e;
          }
        })
        .catch((error) => {
          if (n > 0) {
            setTimeout(() => {
              wrappedFetch((n - 1));
            }, retryDelay);
          } else {
            reject(error);
          }
        });
    };
    wrappedFetch(retries);
  });
};

export const hasOwnProperties = (obj, propertyTree) => {
  if ((obj instanceof Object) === false) {
    return false;
  }
  const property = propertyTree[0];
  const hasProperty = obj.hasOwnProperty(property);
  if (hasProperty) {
    if (propertyTree.length === 1) {
      return hasProperty;
    }
    return hasOwnProperties(obj[property], propertyTree.slice(1));
  }
  return false;
};

//
// Copyright (c) 2018 Cisco Systems
// Licensed under the MIT License 
//

const assert = require("assert");
const debug = require("debug")("api:smartsheet");


var smartsheet = {};


/*
 * Check the sheet can be reached via the SmartSheet API
 */
const DEFAULT_TIMEOUT = 10000; // in seconds
smartsheet.fetch = function (token, id, includeAll, cb) {
    assert.ok((token), "no token specified");
    assert.ok((id), "no sheet specified");

    // Contact the SmartSheet API
    const axios = require('axios');
    let sheetUrl = `https://api.smartsheet.com/2.0/sheets/${id}`
    if (includeAll) {
        sheetUrl += '?includeAll=true'
    }
    const options = {
        timeout: DEFAULT_TIMEOUT,
        headers: { 'Authorization': `Bearer ${token}` }
    };

    axios.get(sheetUrl, options)
        .then(function (response) {
            switch (response.status) {
                case 200:
                    debug("successfully contacted the smartsheet");
                    if (cb) cb (null, response.data);
                    return;
                default:
                    debug(`unexpected error while contact Smartsheet API, status code: ${response.status}`);
                    if (cb) cb ("could not access the smartsheet", null);
                    return;
            }
        })
        .catch(function (err) {
            // handle error
            debug(`error while requesting SmartSheet API, error msg: ${err.message}`);
            if (cb) cb ("could not contact the smartsheet API", null);
            return;
        });
}


module.exports = smartsheet;
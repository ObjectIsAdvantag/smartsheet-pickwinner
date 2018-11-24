//
// Copyright (c) 2018 Cisco Systems
// Licensed under the MIT License 
//


const debug = require("debug")("api");
const express = require("express");



//
// Setting up common services 
//
const app = express();

// Inject in-memory data store for static / non persisted resources
app.locals.datastore = {};

// Check smartsheet info are provided
if (!process.env.SMARTSHEET_TOKEN) {
    console.log("Please specify a SmartSheet API token as a SMARTSHEET_TOKEN env variable. Exiting...");
    process.exit(1);
}
if (!process.env.SMARTSHEET_ID) {
    console.log("Please specify a SmartSheet identifier as a SMARTSHEET_ID env variable. Exiting...");
    process.exit(2);
}
const smartsheet = require("./smartsheet.js");
smartsheet.fetch(process.env.SMARTSHEET_TOKEN, process.env.SMARTSHEET_ID, false, (err, smartsheet) => {
    if (err) {
        console.log(`Could not connect to the smartsheet, err: ${err.message}. Exiting...`);
        process.exit(3);
    }

    debug(`all good, could find the smartsheet: ${smartsheet.name}`)
});

//
// Technical headers, middleware
//

app.set("x-powered-by", false);
app.set("etag", false);

var prefix = process.env.PREFIX || "SSF";
const uuid = require('uuid/v4');
app.use(function (req, res, next) {
    res.setHeader("Cache-Control", "no-cache"); 

    // add Trackingid
    res.locals.trackingId = prefix + "_" + uuid();
    res.setHeader("Trackingid", res.locals.trackingId);

    next();
});

// Healthcheck
app.locals.started = new Date(Date.now()).toISOString();
app.get("/", function(req, res) {
    res.status(200).send({
        "service" : "PickWinner API",
        "description" : "Picks the winner of a challenge run with a SmartSheet backend.",
        "version" : require('./package.json').version,
        "up-since" : app.locals.started
    });
});


//
// Loading API resources
//

const pickAPI = require("./pickwinner.js");
app.use("/pick", pickAPI);


//
// Start  server
//
const port = process.env.PORT || 8080;
app.listen(port, function () {
    console.log(`Server started on port: ${port}`);
});

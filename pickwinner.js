//
// Copyright (c) 2018 Cisco Systems
// Licensed under the MIT License 
//


const debug = require("debug")("api:pick");
const logGuesses = require("debug")("api:guess");
const express = require("express");

// default routing properties
const router = express.Router({ "caseSensitive": true, "strict": false });

// for parsing application/json
const bodyParser = require("body-parser");
router.use(bodyParser.json());

// Extra imports 
const sendError = require('./utils').sendError;
const sendSuccess = require('./utils').sendSuccess;

//
// In-memory store
//
var datastore = {};


//
// Pick a winner for a SmartSheet id and a Guess
//

router.get("/", function (req, res) {

    // Check Authentication
    const authHeader = req.get("Authorization");
    if (!authHeader) {
        debug("authentication failed: no Authorization heder");
        return sendError(res, 401, "authentication failed", "please place your API token in the 'Authorization' HTTP header with a 'Bearer' prefix");
    }
    // Extract token
    const splitted = authHeader.match(/^Bearer\s([0-9a-zA-Z]*)$/);
    if (!splitted || (splitted.length != 2)) {
        debug("authentication header does not match 'Bearer [0-9a-zA-Z]*' pattern");
        return sendError(res, 401, "authentication header does not match 'Bearer [0-9a-zA-Z]*' pattern");
    }
    // Check token
    const token = splitted[1];
    const authcode = process.env.API_SECRET || "ObjectIsAdvantag";
    if (token !== authcode) {
        debug("authentication token failed, token did not match");
        return sendError(res, 401, "authentication failed, bad token");
    }
    debug('authentication ok');

    // Check query parameters
    // Mandatory parameter: challenge
    const challenge = req.query["challenge"];
    if (!challenge) {
        debug("challenge not specified");
        return sendError(res, 400, "answer not specified", "please specify the answer to the challenge as a 'answer' query parameter");
    }
    debug(`found challenge: ${challenge}`);

    // Mandatory parameter: answer
    const answer = req.query["answer"];
    if (!answer) {
        debug("answer not specified");
        return sendError(res, 400, "answer not found", "please specify the answer to the challenge as a 'answer' query parameter");
    }
    const answerAsFloat = parseFloat(answer);
    if (!answerAsFloat) {
        debug("cannot parse answer as a float!");
        return sendError(res, 400, "answer is not a float", "please specify the answer to the challenge as a float number, formatted as 'X.YZ'");
    }
    debug(`computing winners for actual answer: ${answerAsFloat}`);

    // Optional number of winners to display : defaults to 10
    var top = parseInt(req.query["top"]);
    if (!top) {
        top = 10;
    }
    debug(`will fetch top: ${top} winners`);

    // Pick winner
    computeChallenge(challenge, answerAsFloat, top, function (err, result) {
        if (err) {
            debug(`error while picking winners: ${err.message}`);
            return sendError(res, 500, { message: err.message });
        }

        return sendSuccess(res, 200, result);
    });
})

module.exports = router;


// Pick winners logic:
//    - fetch rows
//    - filter on the challenge
//    - sanitize entries (remove invalid, and deduplicate)
//    - pick winner
function computeChallenge(challenge, answer, top, cb) {

    // Fetch rows
    const smartsheet = require('./smartsheet.js');
    smartsheet.fetch(process.env.SMARTSHEET_TOKEN, process.env.SMARTSHEET_ID, true, (err, smartsheet) => {
        if (err) {
            debug(`error while fetching smartsheet, err: ${err.message}`);
            if (cb) cb(err, null);
            return;
        }
        debug(`found a total of ${smartsheet.rows.length} rows`);

        // Filter on challenge
        let filtered = [];
        smartsheet.rows.forEach((elem) => {
            let row = mapRow(elem);
            // The first cell is the challenge name
            if (challenge === row.challenge) {
                filtered.push(row);
            }
        });
        debug(`after filtering on challenge, total of ${filtered.length} rows`);

        // sanitize entries
        //     - remove invalid: not matching XX.YY format
        //     - remove deduplicates: keep the earliest
        let sanitized = {};
        let ignored = 0;
        filtered.forEach(function (elem) {
            // An entry MUST have a profile, a guess, a date and a name (either full / first or last)
            if (!(elem.profile && ((elem.firstName && elem.lastName) || (elem.fullname)) && elem.guess && elem.submittedAt)) {
                logGuesses(`${++ignored}: ignoring invalid entry: ${elem.guess}, from: ${elem.fullName} or (${elem.firstName} / ${elem.lastName})`);
                return;
            }

            // Remove invalid entries (keep only floats with 2 decimals guesses)
            //    - the rules state that people MUST enter
            //    - a weight in kg “with an approximation to the second decimal place”.
            let guess = elem.guess;
            if ((typeof guess) !== 'number') {
                let parsed = guess.match(/(\d{0,2})[\.|,](\d{0,2})/);
                if (!parsed) {
                    logGuesses(`guess ${guess} does not match XX.YY format`);
                    checker = `INVALID: guess ${guess} does not match XX.YY format`;
                    logGuesses(`${++ignored}: ignoring invalid entry: ${elem.guess}, from: ${elem.fullName} or (${elem.firstName} / ${elem.lastName})`);
                    return;
                }
                else {
                    let entry = (parsed[1] === '') ? 0 : parsed[1];
                    entry += '.';
                    entry += (parsed[2] === '') ? 0 : parsed[2];
                    guess = parseFloat(entry);
                    logGuesses(`value: ${guess} will be considered for guess: ${elem.guess}`);
                    checker = `GOOD: considering ${guess} as the guess`;
                }
            }
            else {
                checker = `GOOD: confirmed ${guess} as the guess`;
            }
            elem.confirmed = guess;

            // Keep only earliest entry for a profile
            let exists = sanitized[elem.profile];
            if (exists) {
                // Remove newer entries, keeping the earlist
                if (exists.submittedAt <= elem.submittedAt) {
                    logGuesses(`${++ignored}: ignoring duplicate from: ${elem.fullName} | (${elem.firstName} / ${elem.lastName}), profile: ${elem.profile}, priorizing earliest!`);
                    return;
                }
            }

            // add entry
            sanitized[elem.profile] = elem;
        });
        debug(`after sanitizing: total of ${Object.keys(sanitized).length} submissions, ignored: ${ignored} submissions`);

        // Pick winner
        const challenges = JSON.parse(require('fs').readFileSync('./challenges.json', 'utf8'));

        // Look for the challenge start time
        let beganAt;
        if (challenges[challenge]) {
            beganAt = challenges[challenge].begin;
        }
        else {
            beganAt = challenges["default"].begin;
        } 

        const winners = pickWinner(sanitized, answer, beganAt, top);
        if (cb) cb(null, {
            "submissions": {
                "total": filtered.length,
                "ignored": ignored,
                "competing": Object.keys(sanitized).length
            },
            "winners": winners
        });
    });
}

// Map a raw row to a challenge row
const assert = require("assert");
function mapRow(elem) {
    assert.ok((elem), "no elemement specified");

    if (elem.cells.length < 7) {
        debug("WARNING: invalid sheet format. Could not find enough columns!")
        return {};
    }

    return {
        challenge: elem.cells[0].value,
        fullName: elem.cells[1].value,
        firstName: elem.cells[2].value,
        lastName: elem.cells[3].value,
        guess: elem.cells[4].value,
        submittedAt: elem.cells[5].value,
        profile: elem.cells[6].value,
    }
}

function pickWinner(submissions, answer, beganAt, top) {
    // Add a score to each answer
    let scored = [];
    Object.keys(submissions).forEach(function (key) {
        let elem = submissions[key];

        // Integer part of the score is the proximity to the answer
        let score = Math.round(Math.abs(elem.confirmed - answer) * 100);

        // Floating part of the scoreis the proximity to the challenge start
        var seconds = Math.abs((new Date(elem.submittedAt).getTime() - new Date(beganAt).getTime()) / 1000);
        if (seconds < 0) {
            debug(`unexpected answer from ${elem.fullName}, submitted before challenge began`);
            // Set score to cannot win
            elem.score = 999999999;
        }
        else {
            elem.score = parseFloat(`${score}.${seconds}`);
        }

        scored.push(elem);
    });

    // Sort by score (lowest to highest)
    var sorted = scored.sort(function (answer1, answer2) {
        return (answer1.score - answer2.score);
    });

    // Return 'top' first answers
    sorted = sorted.slice(0, top);

    return sorted;
}
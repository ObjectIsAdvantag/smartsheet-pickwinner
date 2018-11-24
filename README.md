# API to pick a winner

Picks a winner for a challenge run on a SmartSheet back-end, formatted with 6 columns:
- challenge: identifer of the challenge
- fullname
- firstname
- lastname
- guess: proposed answer to the challenge, but the submitter
- submittedAt: auto-generated
- profile: unique id of a participant (generally managed in a 3rd party system, and passed to the smartsheet as an hidden field)

Note: the technical challenge here is to sanatize and deduplicate the entries; this is implemented by [pickwinner.js](./pickwinner.js).

## Quick start

From the terminal, launch the API with your smartsheet id and access token:

```shell
git clone https://github.com/ObjectIsAdvantag/smartsheet-pickwinner
cd smartsheet-pickwinner
npm install
 DEBUG=api* SMARTSHEET_TOKEN=w5090rukgipkb5jnr0jgjgmqq0 SMARTSHEET_ID=6304046275510532 node server.js
```

Then from a REST client, pick a winner by submitting an answer

```shell
curl -X GET 'http://<host>/pick?challenge=kilograms&answer=4.45&top=10' \\
  -H 'Authorization: Bearer SECRET' 
```

const listenPort = process.env.PORT || 8080

const gameserver = require('./gameserver.js');
const express = require('express');
const { body, checkSchema, matchedData, validationResult } = require('express-validator');

const app = express();
const http = require('http').Server(app);

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Init server vars
let servers = [];
let currentServerIndex;
let serverToJoinIndex;

app.post('/server/current', [
	body('app_key').equals(process.env.APP_KEY).bail(),
	body('ip').isIP(),
	body('port').isPort(),
	body('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage("Password contains illegal characters"),
	body('in_rotation').isBoolean().toBoolean()
], (req, res) => {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}

	// Set index
	currentServerIndex = addServer(req.body.ip, req.body.port, req.body.password, req.body.in_rotation);

	// Remove to join index if to join server is now the current server
	if (currentServerIndex === serverToJoinIndex) serverToJoinIndex = undefined;

	// Send response
	res.json({
		'message': 'Updated current server succesfully',
		'serverIndex': currentServerIndex
	});
});

// Use checkSchema because data can be provided in body or query
app.post('/server/join', checkSchema({
	app_key: {
		in: ['body', 'query'],
		// use custom validator because equals: did not work
		custom: {
			options: (value) => {
				return value === process.env.APP_KEY;
			}
		}
	},
	ip: {
		in: ['body', 'query'],
		isIP: true
	},
	port: {
		in: ['body', 'query'],
		isPort: true
	},
	password: {
		in: ['body', 'query'],
		matches: /^[a-zA-Z0-9_\-]*$/,
		errorMessage: "Password contains illegal characters"
	}
}), (req, res) => {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}

	// Get data from body and query
	const data = matchedData(req, { locations: ['body', 'query'] });

	// Set index
	let serverIndex = addServer(data.ip, data.port, data.password, false);

	// Update server to join index (only if index is different from currrent server index)
	let message;
	if (serverIndex !== currentServerIndex) {
		message = 'Specator will join server shortly';
		serverToJoinIndex = serverIndex;
	} else {
		message = 'Spectator is already on requested server';
	}

	// Send response
	res.json({
		'message': message,
		'serverIndex': serverIndex
	});
});

app.get('/server/all', (req, res) => {
	res.send(servers);
});

app.get('/server/current', (req, res) => {
	if (servers.length > 0 && currentServerIndex !== undefined) {
		res.send(servers[currentServerIndex]);
	} else {
		res.status = 404;
		res.send("No servers have been added/specator not on any server");
	}
})

app.get('/server/join', (req, res) => {
	if (servers.length > 0 && serverToJoinIndex !== undefined) {
		res.send(servers[serverToJoinIndex]);
	} else {
		res.status = 404;
		res.send("No servers have been added/no server to join");
	}
});

function addServer(ip, port, password, in_rotation) {
	let serverIndex;

	// Init server object
	bf2Server = new gameserver(
		ip,
		port,
		password,
		in_rotation
	);

	// Check if server is already in array (not using function shorthand because array can be empty)
	servers.forEach(function (existingServer, existingServerIndex) {
		if (JSON.stringify(existingServer) === JSON.stringify(bf2Server)) {
			serverIndex = existingServerIndex;
		}
	});

	// Add server (not in array yet)
	if (serverIndex === undefined) {
		serverIndex = servers.push(bf2Server) - 1;
	}

	return serverIndex;
}

var server = http.listen(listenPort, () => {
	console.log('Listening on port ' + listenPort);
});

exports = module.exports = app;

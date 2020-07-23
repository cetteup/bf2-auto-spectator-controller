const listenPort = process.env.PORT || 8080

const gameserver = require('./gameserver.js');
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const app = express();
const http = require('http').Server(app);
const axios = require('axios');
const cheerio = require('cheerio');
const gamedig = require('gamedig');
const cron = require('node-cron');

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Init server vars
let servers = [];
let currentServerIndex;
let serverToJoinIndex;

app.post('/servers/current', [
	body('app_key').equals(process.env.APP_KEY).bail(),
	body('ip').isIP(),
	body('port').isPort(),
	body('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
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
	console.log('Current server updated');
});

app.post('/servers/join', [
	body('app_key').equals(process.env.APP_KEY).bail(),
	body('ip').isIP(),
	body('port').isPort(),
	body('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
], (req, res) => {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}

	// Set index
	let serverIndex = addServer(req.body.ip, req.body.port, req.body.password, false);

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

// Allow Moobot to send a join server request via HTTP GET
app.get('/servers/join-moobot', [
	query('app_key').equals(process.env.APP_KEY).bail(),
	query('ip').isIP(),
	query('port').isPort(),
	query('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
], (req, res) => {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}

	// Set index
	let serverIndex = addServer(req.query.ip, req.query.port, req.query.password, false);

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

app.get('/servers', (req, res) => {
	res.send(servers);
});

app.get('/servers/current', (req, res) => {
	if (servers.length > 0 && currentServerIndex !== undefined) {
		res.send(servers[currentServerIndex]);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/name', (req, res) => {
	if (servers.length > 0 && currentServerIndex !== undefined) {
		res.send(servers[currentServerIndex].name);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/map', (req, res) => {
	if (servers.length > 0 && currentServerIndex !== undefined) {
		res.send(servers[currentServerIndex].map);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/ping', (req, res) => {
	if (servers.length > 0 && currentServerIndex !== undefined) {
		// Find spectator player
		let specator = servers[currentServerIndex].players.find((player) => {
			// Check if player name contains spectator name, then check futher if required
			if (player.name.indexOf(process.env.SPECTATOR_NAME) > -1) {
				// Split raw name into clan tag and actual account name
				let nameElements = player.name.split(' ');
				// Check if account name matches
				return nameElements[nameElements.length - 1] === process.env.SPECTATOR_NAME;
			}
		});

		if (specator !== undefined) {
			res.send(`${specator.ping}`);
		} else {
			res.status(404).send('Spectator not on server');
		}
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/players/total', (req, res) => {
	if (servers.length > 0 && currentServerIndex !== undefined) {
		res.send(`${servers[currentServerIndex].players.length}/${servers[currentServerIndex].maxplayers}`);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/players/summary', (req, res) => {
	if (servers.length > 0 && currentServerIndex !== undefined) {
		let humanPlayers = getHumanPlayers(currentServerIndex);
		res.send({
			max: servers[currentServerIndex].maxplayers,
			online: servers[currentServerIndex].players.length,
			human: humanPlayers.length,
			active: getActivePlayers(currentServerIndex).length,
			bots: servers[currentServerIndex].players.length - humanPlayers.length
		});
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/join', (req, res) => {
	if (servers.length > 0 && serverToJoinIndex !== undefined) {
		res.send(servers[serverToJoinIndex]);
	} else {
		res.status(404).send('No servers have been added/no server to join');
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
		if (existingServer.ip === bf2Server.ip && existingServer.port === bf2Server.port && existingServer.password === bf2Server.password) {
			serverIndex = existingServerIndex;
		}
	});

	// Add server (not in array yet)
	if (serverIndex === undefined) {
		serverIndex = servers.push(bf2Server) - 1;
	}

	// Fetch server state
	getServerState(serverIndex);

	return serverIndex;
}

function getServerState(serverIndex) {
	gamedig.query({
		type: 'bf2',
		host: servers[serverIndex].ip
	}).then((state) => {
		servers[serverIndex].name = state.name
		servers[serverIndex].map = state.map
		servers[serverIndex].ping = state.ping
		servers[serverIndex].maxplayers = state.maxplayers
		// Add players sorted by score (desc)
		servers[serverIndex].players = state.players.sort((a, b) => {
			return b.score - a.score;
		});
	}).catch((error) => {
		console.log('Gamedig query resulted in an error');
	});
}

function getHumanPlayers(serverIndex) {
	// Return all players that are not the spectator and not a placeholder bot (have 0 ping)
	return servers[serverIndex].players.filter((player) => {
		// Split raw name into clan tag and actual account name
		let nameElements = player.name.split(' ');
		return nameElements[nameElements.length - 1] !== process.env.SPECTATOR_NAME && player.ping !== 0;
	});
}

function getActivePlayers(serverIndex) {
	// Get human players
	let humanPlayers = getHumanPlayers(serverIndex);

	// Return all players that either have a score other than zero or have died
	return humanPlayers.filter((player) => {
		return player.score != 0 || player.score != 0;
	});
}

cron.schedule('*/1 * * * *', () => {
	if (servers.length > 0 && currentServerIndex !== undefined) {
		console.log('Updating game server state')
		getServerState(currentServerIndex);
	}
});

var server = http.listen(listenPort, () => {
	console.log('Listening on port ' + listenPort);
});

exports = module.exports = app;

const listenPort = process.env.PORT || 8080;
const gamedigMaxAttempts = process.env.GAMEDIG_MAX_ATTEMPTS || 1;
const gamedigSocketTimeout = process.env.GAMEDIG_SOCKET_TIMEOUT || 2000;

const gameserver = require('./gameserver.js');
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const app = express();
const http = require('http').Server(app);
const axios = require('axios');
const gamedig = require('gamedig');
const cron = require('node-cron');

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Init server vars
let gameServers = [];
let currentServerIndex;
let serverToJoinIndex;

// Initial game server list build
console.log('Building game server list');
buildServerList(process.env.SERVER_LIST_URL);

app.post('/servers/current', [
	body('app_key').equals(process.env.APP_KEY).bail(),
	body('ip').isIP(),
	body('port').isPort().toInt(),
	body('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
	body('in_rotation').isBoolean().toBoolean()
], (req, res) => {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}

	// Add server
	let gameServer = addServer(req.body.ip, req.body.port, req.body.password, req.body.in_rotation);
	// Update index
	currentServerIndex = gameServers.indexOf(gameServer)
	
	// Remove to join index if to join server is now the current server
	if (currentServerIndex === serverToJoinIndex) serverToJoinIndex = undefined;
	
	// Send response
	res.json({
		message: 'Updated current server succesfully',
		server: {
			ip: gameServer.ip,
			port: gameServer.game_port
		}
	});
	console.log('Current server updated');
});

app.post('/servers/join', [
	body('app_key').equals(process.env.APP_KEY).bail(),
	body('ip').isIP(),
	body('port').isPort().toInt(),
	body('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
], (req, res) => {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}

	// Set index
	let gameServer = addServer(req.body.ip, req.body.port, req.body.password, false);

	// Update server to join index (only if index is different from currrent server index)
	let message;
	if (gameServers.indexOf(gameServer) !== currentServerIndex) {
		message = 'Specator will join server shortly';
		serverToJoinIndex = gameServers.indexOf(gameServer);
	} else {
		message = 'Spectator is already on requested server';
	}

	// Send response
	res.json({
		message: message,
		server: {
			ip: gameServer.ip,
			port: gameServer.game_port
		}
	});
});

// Allow Moobot to send a join server request via HTTP GET
app.get('/servers/join-moobot', [
	query('app_key').equals(process.env.APP_KEY).bail(),
	query('ip').isIP(),
	query('port').isPort().toInt(),
	query('password').matches(/^[a-zA-Z0-9_\-]*$/).withMessage('Password contains illegal characters'),
], (req, res) => {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}

	// Add game server
	let gameServer = addServer(req.query.ip, req.query.port, req.query.password, false);

	// Update server to join index (only if index is different from currrent server index)
	let message;
	if (gameServers.indexOf(gameServer) !== currentServerIndex) {
		message = 'Specator will join server shortly';
		serverToJoinIndex = gameServers.indexOf(gameServer);
	} else {
		message = 'Spectator is already on requested server';
	}

	// Send response
	res.json({
		message: message,
		server: {
			ip: gameServer.ip,
			port: gameServer.game_port
		}
	});
});

app.get('/servers', (req, res) => {
	res.json(gameServers);
});

app.get('/servers/current', (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		res.json(gameServers[currentServerIndex]);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/name', (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		res.send(gameServers[currentServerIndex].name);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/map', (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		res.send(gameServers[currentServerIndex].map);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/ping', (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		// Find spectator player
		let specator = gameServers[currentServerIndex].players.find((player) => {
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
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		res.send(`${gameServers[currentServerIndex].players.length}/${gameServers[currentServerIndex].maxplayers}`);
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/players/summary', (req, res) => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		let humanPlayers = getHumanPlayers(gameServers[currentServerIndex]);
		res.json({
			max: gameServers[currentServerIndex].maxplayers,
			online: gameServers[currentServerIndex].players.length,
			human: humanPlayers.length,
			active: getActivePlayers(gameServers[currentServerIndex]).length,
			bots: gameServers[currentServerIndex].players.length - humanPlayers.length
		});
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/current/players/top', [
	query('count').toInt().customSanitizer(value => {
		if (value >= 1 && value <= 10) {
			return value;
		} else {
			return 3;
		}
	}),
	query('as_text').toBoolean()
], (req, res) => {
	// Validate inputs
	const errors = validationResult(req)
	if (!errors.isEmpty()) {
		return res.status(422).json({ errors: errors.array() });
	}

	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		// Get the top n slice of players
		let players = gameServers[currentServerIndex].players.slice(0, req.query.count);

		// Send text of json response
		if (req.query.as_text) {
			// Determine number to pad up to
			let indexPadTo = String(req.query.count).length;
			// Build text message (format: #[padded index/place]: [player name])
			let rankings = players.map((player, index) => {
				// Determine whether to add space after player tag (no space if no tag)
				let tagPadTo = player.tag.length > 0 ? player.tag.length + 1 : 0;
				const text = `#${String(index + 1).padStart(indexPadTo, '0')}: ${player.tag.padEnd(tagPadTo, ' ')}${player.name}`;
				// Add space after dots so tags/names will not show up as links 
				return text.replace('.', '. ');
			});
			res.send(rankings.join(' - '));
		} else {
			res.json(players);
		}
	} else {
		res.status(404).send('No servers have been added/specator not on any server');
	}
})

app.get('/servers/join', (req, res) => {
	if (gameServers.length > 0 && serverToJoinIndex !== undefined) {
		let gameServer = gameServers[serverToJoinIndex];
		// Only send server details required to join it
		res.json({
			ip: gameServer.ip,
			game_port: gameServer.game_port,
			password: gameServer.password,
			in_rotation: gameServer.in_rotation
		});
	} else {
		res.status(404).send('No servers have been added/no server to join');
	}
});

function buildServerList(listUrl) {
	// Fetch server list containing IP and query ports
	axios.get(listUrl)
	.then((response) => {
		console.log(`Got server list with ${response.data.length} game servers`)
		response.data.forEach((server) => {
			// Check if gameserver is already known
			let gameServer = gameServers.find((knownServer) => knownServer.ip === server.ip && knownServer.query_port === server.query_port);

			// Add game server if not found
			if (gameServer === undefined) {
				// Init gameserver
				let gameServer = new gameserver(server.ip, parseInt(server.query_port));
					
				// Get state
				getServerState(gameServer);

				// Add server to global array
				gameServers.push(gameServer);
			}
		});
	})
	.catch((error) => {
		console.log('Fetching primary server list resulted in an error', error);
	});
}

function addServer(ip, gamePort, password, inRotation) {
	// Check if server is in global array
	gameServer = gameServers.find(server => server.ip === ip && server.game_port === gamePort);

	// Update or add gameserver
	if (gameServer !== undefined) {
		gameServer.password = password;
		gameServer.in_rotation = inRotation;
	} else {
		// Unknown server, init server object with default query port
		gameServer = new gameserver(ip, 29900);
		gameServer.game_port = gamePort;
		gameServer.password = password;
		gameServer.in_rotation = inRotation;

		// Add server to global array
		gameServers.push(gameServer);
	}

	// Fetch server state
	getServerState(gameServer);

	return gameServer;
}

function getServerState(server) {
	gamedig.query({
		type: 'bf2',
		host: server.ip,
		port: server.query_port,
		maxAttempts: gamedigMaxAttempts,
		socketTimeout: gamedigSocketTimeout
	}).then((state) => {
		server.game_port = parseInt(state.connect.split(':')[1]);
		server.name = state.name;
		server.map = state.map;
		server.ping = state.ping;
		server.maxplayers = state.maxplayers;
		// Add players sorted by score (desc)
		server.players = [];
		state.players.sort((a, b) => {
			return b.score - a.score;
		}).forEach((player) => {
			// gamedig does not parse some values (skill/kills and AIBot), so parse now
			// and while at, fix keys skill => kills, AIBot => aibot and split the name
			let nameElements = player.name.split(' ');
			server.players.push({
				name: nameElements[nameElements.length - 1],
				tag: nameElements[0],
				score: player.score,
				ping: player.ping,
				team: player.team,
				deaths: player.deaths,
				pid: player.pid,
				kills: parseInt(player.skill),
				aibot: !!parseInt(player.AIBot)
			})
		});
	}).catch((error) => {
		console.log('Gamedig query resulted in an error', server.ip, server.query_port);
	});
}

function getHumanPlayers(gameServer) {
	// Return all players that are not the spectator and not a placeholder bot (have 0 ping)
	return gameServer.players.filter((player) => {
		return !player.aibot && player.name !== process.env.SPECTATOR_NAME && (player.ping > 0 || player.score !== 0 || player.kills !== 0 || player.deaths !== 0);
	});
}

function getActivePlayers(gameServer) {
	// Get human players
	let humanPlayers = getHumanPlayers(gameServer);

	// Return all players that either have a score other than zero or have died
	return humanPlayers.filter((player) => {
		return player.score !== 0 || player.kills !== 0 || player.deaths !== 0;
	});
}

// Update current server's state every minute
cron.schedule('*/1 * * * *', () => {
	if (gameServers.length > 0 && currentServerIndex !== undefined) {
		console.log('Updating game server state')
		getServerState(gameServers[currentServerIndex]);
	}
});

// Re-build server list every 12 hours
cron.schedule('0 */12 * * *', () => {
	console.log('Re-building game server list');
	buildServerList(process.env.SERVER_LIST_URL);
})

var server = http.listen(listenPort, () => {
	console.log('Listening on port', listenPort);
	console.log('game server list url is', process.env.SERVER_LIST_URL);
	console.log('gamedig max attempts is', gamedigMaxAttempts);
	console.log('gamedig socket timeout is', gamedigSocketTimeout);
});

exports = module.exports = app;

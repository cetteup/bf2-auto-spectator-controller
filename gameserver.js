const { query } = require("express");

class GameServer {
	constructor(ip, queryPort) {
		this.ip = ip;
		this.queryPort = queryPort;
		this.gamePort = -1;
		this.password = '';
		this.inRotation = false;
	}
};

module.exports = GameServer;
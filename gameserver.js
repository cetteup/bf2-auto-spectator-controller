const { query } = require("express");

class GameServer {
	constructor(ip, query_port) {
		this.ip = ip;
		this.query_port = query_port;
		this.game_port = -1;
		this.password = '';
		this.in_rotation = false;
	}
};

module.exports = GameServer;
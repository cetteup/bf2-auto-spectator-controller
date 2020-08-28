class GameServer {
	constructor(ip, gamePort) {
		this.ip = ip;
		this.gamePort = gamePort;
		this.password = '';
		this.inRotation = false;
	}
};

module.exports = GameServer;
class GameServer {
	constructor(ip, port, password, in_rotation) {
		this.ip = ip;
		this.port = port;
		this.password = password;
		this.in_rotation = in_rotation;
	}	
};

module.exports = GameServer;
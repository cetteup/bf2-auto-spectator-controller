import * as socketio from 'socket.io';
import * as tmi from 'tmi.js';
import Config from '../../config';
import { ForwardCommandDTO, SpectatorCommand } from '../../typing';
import Constants from '../../constants';

export async function forwardSpectatorCommand(io: socketio.Server, client: tmi.Client, command: SpectatorCommand): Promise<void> {
    io.emit('command', <ForwardCommandDTO>{
        key: command,
        value: true
    });
    await client.say(Config.SPECTATOR_CHANNEL, Constants.COMMAND_RESPONSES[command]);
}

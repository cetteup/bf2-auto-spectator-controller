import { ForwardedSpectatorCommand } from './spectator';

export default abstract class Constants {
    static readonly COMMAND_RESPONSES: Record<ForwardedSpectatorCommand, string> = {
        start: 'Yessir, stream will start shorly',
        stop: 'If you say so... Stream will stop shortly',
        debug: 'Guess I can do that. Toggling debug options.',
        game_restart: 'Ok, will restart the game shortly',
        rotation_pause: 'Roger, will stay on current player for 5 minutes',
        rotation_resume: 'Confirmed, resuming player rotation',
        next_player: 'Right away, skipping to next player',
        respawn: 'Alright, will spawn and restart spectating shortly',
        rejoin: 'Sure, will disconnect and rejoin server momentarily'
    };
}

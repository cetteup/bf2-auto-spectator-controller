export default abstract class Constants {
    static readonly COMMAND_RESPONSES: Record<string, string> = {
        game_restart: 'Ok, will restart the game shortly',
        rotation_pause: 'Roger, will stay on current player for 5 minutes',
        rotation_resume: 'Confirmed, resuming player rotation',
        next_player: 'Right away, skipping to next player',
        respawn: 'Alright, will spawn and restart spectating shortly'
    };
}

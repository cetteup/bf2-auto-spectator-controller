export type ServerState = {
    ip: string
    port: number
    name: string
    numPlayers: number
    maxPlayers: number
    mapName: string
    mapSize: number
    gameType: string
    reservedSlots: number
    noVehicles: boolean
    joinLinkWeb?: string
    players: {
        pid: number
        name: string
        tag: string
        score: number
        kills: number
        deaths: number
        ping: number
        team: number
        teamLabel: string
        aibot: boolean
    }[]
}

export type Query = {
    ip: string
    port: number
}

export function isValidPort(port: number): boolean {
    return port > 0 && port < 65536;
}

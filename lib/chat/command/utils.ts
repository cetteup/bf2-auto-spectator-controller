import { Duration } from 'luxon';

export function isValidPort(port: number): boolean {
    return port > 0 && port < 65536;
}

export function formatDuration(duration: Duration): string {
    const rescaled = duration.rescale();
    if (rescaled < Duration.fromObject({ minutes: 1 })) {
        return 'just a moment';
    }

    const elements: string[] = [];
    const hours = rescaled.get('hours');
    if (hours >= 2) {
        elements.push(`${hours.toFixed(0)} hours`);
    }
    else if (hours >= 1) {
        elements.push('an hour');
    }

    const minutes = rescaled.get('minutes');
    if (minutes >= 2) {
        elements.push(`${minutes.toFixed(0)} minutes`);
    }
    else if (minutes >= 1) {
        elements.push('a minute');
    }

    return elements.join(' and ');
}

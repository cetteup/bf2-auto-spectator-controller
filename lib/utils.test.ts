import { Duration } from 'luxon';
import { formatDuration } from './utils';

describe('format duration', () => {
    test('shorter than one minute', () => {
        const duration = Duration.fromObject({ seconds: 50 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('just a moment');
    });

    test('exactly one minute', () => {
        const duration = Duration.fromObject({ minutes: 1 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('a minute');
    });

    test('several minutes', () => {
        const duration = Duration.fromObject({ minutes: 2 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('2 minutes');
    });

    test('exactly one hour', () => {
        const duration = Duration.fromObject({ hours: 1 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('an hour');
    });

    test('several hours', () => {
        const duration = Duration.fromObject({ hours: 2 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('2 hours');
    });

    test('rescale smaller units', () => {
        const duration = Duration.fromObject({ seconds: 60 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('a minute');
    });

    test('one hour and one minute', () => {
        const duration = Duration.fromObject({ hours: 1, minutes: 1 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('an hour and a minute');
    });

    test('one hour and several minutes', () => {
        const duration = Duration.fromObject({ hours: 1, minutes: 2 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('an hour and 2 minutes');
    });

    test('several hours and one minute', () => {
        const duration = Duration.fromObject({ hours: 2, minutes: 1 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('2 hours and a minute');
    });

    test('several hours and several minutes', () => {
        const duration = Duration.fromObject({ hours: 2, minutes: 2 });
        const formatted = formatDuration(duration);

        expect(formatted).toBe('2 hours and 2 minutes');
    });
});

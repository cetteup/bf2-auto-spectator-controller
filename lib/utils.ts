import axios from 'axios';
import Config from './config';
import path from 'path';
import { Schema, ValidationError, Validator, ValidatorResultError } from 'jsonschema';
import fs from 'fs';
import logger from './logger';
import yaml from 'js-yaml';
import { GamePhase } from './spectator';

export function loadConfig<T>(configFileName: string, schemaFileName: string): T[] {
    const configPath = path.join(Config.ROOT_DIR, configFileName);
    if (!fs.existsSync(configPath)) {
        return [];
    }
    
    const schemaPath = path.join(Config.ROOT_DIR, schemaFileName);
    let schema: Schema;
    try {
        const unparsed = fs.readFileSync(schemaPath, { encoding: 'utf8' });
        schema = JSON.parse(unparsed);
    }
    catch (error) {
        logger.error('Failed to read/parse schema', schemaPath, error instanceof Error ? error.message : error);
        return [];
    }
    
    try {
        const unparsed = fs.readFileSync(configPath, { encoding: 'utf8' });
        const config = yaml.load(unparsed) as T[];

        const validator = new Validator();
        validator.validate(config, schema, { throwAll: true });

        return config;
    }
    catch (error) {
        if (error instanceof ValidatorResultError && Array.isArray(error.errors) && error.schema) {
            // Log all validation errors if schema validation failed
            logger.error('Given config does not adhere to schema', configPath, schemaPath, error.errors.map((e: ValidationError) => `${e.property}: ${e.message}`));
        }
        else {
            logger.error('Failed to read/parse config file', configPath, error instanceof Error ? error.message : error);
        }
        return [];
    }
}



export async function isAccessTokenValid(accessToken: string): Promise<boolean> {
    try {
        await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-Id': Config.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        return true;
    }
    catch {
        return false;
    }
}

export function formatOAuthPassword(accessToken: string) {
    return `oauth:${accessToken}`;
}

export function isRotationEnabledGamePhase(phase: GamePhase): boolean {
    switch (phase) {
        case 'initializing':
        case 'launching':
        case 'in-menu':
        case 'between-rounds':
        case 'closing':
        case 'starting':
        case 'stopping':
        case 'stopped':
            return true;

        case 'loading':
        case 'spawning':
        case 'spectating':
        case 'halted':
            return false;

        default:
            return false;
    }
}

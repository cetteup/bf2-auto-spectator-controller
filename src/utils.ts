import axios from 'axios';
import Config from './config';
import path from 'path';
import { Schema, ValidationError, Validator } from 'jsonschema';
import fs from 'fs';
import logger from './logger';
import yaml from 'js-yaml';

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
    catch (e: any) {
        logger.error('Failed to read/parse schema', schemaPath, e.message);
        return [];
    }
    
    try {
        const unparsed = fs.readFileSync(configPath, { encoding: 'utf8' });
        const config = yaml.load(unparsed) as T[];

        const validator = new Validator();
        validator.validate(config, schema, { throwAll: true });

        return config;
    }
    catch (e: any) {
        if (Array.isArray(e.errors) && e.schema) {
            // Log all validation errors if schema validation failed
            logger.error('Given config does not adhere to schema', configPath, schemaPath, e.errors.map((e: ValidationError) => `${e.property}: ${e.message}`));
        }
        else {
            logger.error('Failed to read/parse config file', configPath, e.message);
        }
        return [];
    }
}

export function isValidPort(port: number): boolean {
    return port > 0 && port < 65536;
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
    catch (e) {
        return false;
    }
}

export function formatOAuthPassword(accessToken: string) {
    return `oauth:${accessToken}`;
}

import express from 'express';
import { validationResult } from 'express-validator';

export function validateInputs(req: express.Request, res: express.Response, next: express.NextFunction) {
    // Validate inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }
    next();
}

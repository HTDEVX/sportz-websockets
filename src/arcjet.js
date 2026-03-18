import 'dotenv/config';
import arcjet, { detectBot, shield, slidingWindow } from '@arcjet/node';

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode = process.env.ARCJET_MODE === 'DRY_RUN' ? 'DRY_RUN' : 'LIVE';

if (!arcjetKey) throw new Error('ARCJET_KEY environment variable is required');

export const httpArcjet = arcjet({
    key: arcjetKey,
    rules: [
        shield({ mode: arcjetMode}), // Apply Arcjet's shield middleware to all HTTP routes for security and monitoring e.g SQL injection, XSS, etc.
        detectBot({ mode: arcjetMode, allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'] }), // Detect bots and automated traffic accessing the HTTP routes, providing insights into potential malicious activity. Allow only search engine and preview bots to access the HTTP routes, while blocking or monitoring other types of bots to rank our website.
        slidingWindow({ mode: arcjetMode, interval: '10s', max: 50 }), // Implement rate limiting on HTTP routes to prevent abuse and ensure fair usage. Allow a maximum of 50 requests per 10-second interval from a single IP address, helping to mitigate potential DDoS attacks and excessive traffic.
    ]
});

export const wsArcjet = arcjet({
    key: arcjetKey,
    rules: [
        shield({ mode: arcjetMode}), // Apply Arcjet's shield middleware to all HTTP routes for security and monitoring e.g SQL injection, XSS, etc.
        detectBot({ mode: arcjetMode, allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'] }), // Detect bots and automated traffic accessing the HTTP routes, providing insights into potential malicious activity. Allow only search engine and preview bots to access the HTTP routes, while blocking or monitoring other types of bots to rank our website.
        slidingWindow({ mode: arcjetMode, interval: '2s', max: 5 }), // Implement rate limiting on HTTP routes to prevent abuse and ensure fair usage. Allow a maximum of 50 requests per 10-second interval from a single IP address, helping to mitigate potential DDoS attacks and excessive traffic.
    ]
});

export function securityMiddleware() {
    return async (req, res, next) => {
        if (!httpArcjet) return next();
    
        try {
            const decision = await httpArcjet.protect(req);

            if (decision.isDenied()) {
                if (decision.reason.isRateLimit()) {
                    return res.status(429).json({ error: 'Too Many Requests', details: 'You have exceeded the allowed request limit. Please try again later.' });
                }

                return res.status(403).json({ error: 'Forbidden', details: 'Your request has been blocked by security rules.' });
            }
        } catch (error) {
            return res.status(500).json({ error: 'Service Unavailable', details: JSON.stringify(error) });
        }

        next();
    }
}

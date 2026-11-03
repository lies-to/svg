'use strict';

const express = require('express');
const crypto = require('crypto');

const TOTAL_DAYS = 25;
const TOTAL_CANES = 25;
const TIME_ZONE = 'America/New_York';

const CANE_IDS = new Set(
    Array.from({ length: TOTAL_CANES }, (_, i) => `cane-${i + 1}`)
);

const CHRISTMAS_NAME_COLOR = '#e85b65';
const CHRISTMAS_BADGE = 'christmas';

function getChristmasDate() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        if (part.type !== 'literal') {
            values[part.type] = Number(part.value);
        }
    }

    return {
        year: values.year,
        month: values.month,
        day: values.day
    };
}

function getCurrentDay() {
    const date = getChristmasDate();

    if (date.month < 12) return 0;
    if (date.month > 12) return TOTAL_DAYS;

    return Math.min(date.day, TOTAL_DAYS);
}

function getChristmasYear() {
    return getChristmasDate().year;
}

function randomCoins() {
    return crypto.randomInt(1, 6);
}

function getUserId(req) {
    return req.user?.id ?? req.user?.userId ?? req.user?._id;
}

/**
 * Register Christmas routes.
 *
 * Example:
 *
 * const { registerChristmasRoutes } = require('./server/christmas');
 *
 * registerChristmasRoutes(app, {
 *     pool,
 *     requireAuth,
 *     creditCoins
 * });
 *
 * creditCoins(userId, amount, reason)
 * should use your existing coin economy.
 */
function registerChristmasRoutes(app, {
    pool,
    requireAuth,
    creditCoins
}) {
    if (!app) throw new Error('Christmas: Express app is required.');
    if (!pool) throw new Error('Christmas: Database pool is required.');
    if (!requireAuth) throw new Error('Christmas: requireAuth middleware is required.');
    if (!creditCoins) throw new Error('Christmas: creditCoins function is required.');

    const router = express.Router();

    router.use(requireAuth);

    // --------------------------------------------------
    // GET /api/christmas/calendar
    // --------------------------------------------------

    router.get('/calendar', async (req, res) => {
        try {
            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    error: 'Not authenticated.'
                });
            }

            const year = getChristmasYear();
            const currentDay = getCurrentDay();

            const result = await pool.query(
                `SELECT day, coins
                 FROM christmas_calendar_claims
                 WHERE user_id = $1 AND year = $2
                 ORDER BY day ASC`,
                [userId, year]
            );

            const openedDays = result.rows.map(row => Number(row.day));
            const openedSet = new Set(openedDays);

            const skippedDays = [];

            for (let day = 1; day <= currentDay; day++) {
                if (day < currentDay && !openedSet.has(day)) {
                    skippedDays.push(day);
                }
            }

            return res.json({
                year,
                currentDay,
                openedDays,
                skippedDays
            });
        } catch (error) {
            console.error('[Christmas] Calendar error:', error);

            return res.status(500).json({
                error: 'Could not load the Christmas calendar.'
            });
        }
    });

    // --------------------------------------------------
    // POST /api/christmas/calendar/open
    // --------------------------------------------------

    router.post('/calendar/open', async (req, res) => {
        const userId = getUserId(req);
        const day = Number(req.body?.day);
        const year = getChristmasYear();
        const currentDay = getCurrentDay();

        if (!userId) {
            return res.status(401).json({
                error: 'Not authenticated.'
            });
        }

        if (!Number.isInteger(day) || day < 1 || day > TOTAL_DAYS) {
            return res.status(400).json({
                error: 'Invalid calendar day.'
            });
        }

        if (day !== currentDay) {
            return res.status(403).json({
                error: day < currentDay
                    ? 'You missed this box. It cannot be opened anymore.'
                    : 'This box is not available yet.',
                currentDay
            });
        }

        if (getChristmasDate().month !== 12) {
            return res.status(403).json({
                error: 'The Christmas calendar is only available in December.'
            });
        }

        const coins = randomCoins();
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const existing = await client.query(
                `SELECT day
                 FROM christmas_calendar_claims
                 WHERE user_id = $1 AND year = $2 AND day = $3
                 FOR UPDATE`,
                [userId, year, day]
            );

            if (existing.rowCount > 0) {
                await client.query('ROLLBACK');

                return res.status(409).json({
                    error: 'You have already opened this box.'
                });
            }

            await client.query(
                `INSERT INTO christmas_calendar_claims
                    (user_id, year, day, coins, claimed_at)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [userId, year, day, coins]
            );

            await client.query('COMMIT');

            // Award coins through the site's existing economy.
            await creditCoins(userId, coins, 'Christmas calendar reward');

            let cosmetics = null;

            // Day 25 unlocks the Christmas profile cosmetics.
            if (day === 25) {
                await pool.query(
                    `INSERT INTO christmas_cosmetics
                        (user_id, year, name_color, badge, unlocked_at)
                     VALUES ($1, $2, $3, $4, NOW())
                     ON CONFLICT (user_id, year)
                     DO NOTHING`,
                    [
                        userId,
                        year,
                        CHRISTMAS_NAME_COLOR,
                        CHRISTMAS_BADGE
                    ]
                );

                cosmetics = {
                    nameColor: CHRISTMAS_NAME_COLOR,
                    badge: CHRISTMAS_BADGE
                };
            }

            return res.json({
                success: true,
                day,
                coins,
                special: day === 25,
                cosmetics
            });
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {}

            console.error('[Christmas] Calendar reward error:', error);

            return res.status(500).json({
                error: 'Could not claim this Christmas reward.'
            });
        } finally {
            client.release();
        }
    });

    // --------------------------------------------------
    // GET /api/christmas/hunt
    // --------------------------------------------------

    router.get('/hunt', async (req, res) => {
        try {
            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    error: 'Not authenticated.'
                });
            }

            const year = getChristmasYear();

            const result = await pool.query(
                `SELECT cane_id
                 FROM christmas_cane_claims
                 WHERE user_id = $1 AND year = $2`,
                [userId, year]
            );

            const found = result.rows.map(row => row.cane_id);

            return res.json({
                found,
                collected: found.length,
                total: TOTAL_CANES
            });
        } catch (error) {
            console.error('[Christmas] Hunt error:', error);

            return res.status(500).json({
                error: 'Could not load the candy cane hunt.'
            });
        }
    });

    // --------------------------------------------------
    // POST /api/christmas/hunt/collect
    // --------------------------------------------------

    router.post('/hunt/collect', async (req, res) => {
        const userId = getUserId(req);
        const caneId = String(req.body?.caneId || '');
        const year = getChristmasYear();

        if (!userId) {
            return res.status(401).json({
                error: 'Not authenticated.'
            });
        }

        if (!CANE_IDS.has(caneId)) {
            return res.status(400).json({
                error: 'Invalid candy cane.'
            });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const result = await client.query(
                `INSERT INTO christmas_cane_claims
                    (user_id, year, cane_id, collected_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (user_id, year, cane_id)
                 DO NOTHING
                 RETURNING cane_id`,
                [userId, year, caneId]
            );

            if (result.rowCount === 0) {
                await client.query('ROLLBACK');

                return res.status(409).json({
                    error: 'You already collected this candy cane.'
                });
            }

            await client.query('COMMIT');

            await creditCoins(userId, 1, 'Christmas candy cane');

            const countResult = await pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM christmas_cane_claims
                 WHERE user_id = $1 AND year = $2`,
                [userId, year]
            );

            return res.json({
                success: true,
                caneId,
                coins: 1,
                collected: countResult.rows[0].total,
                total: TOTAL_CANES
            });
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {}

            console.error('[Christmas] Candy cane error:', error);

            return res.status(500).json({
                error: 'Could not collect this candy cane.'
            });
        } finally {
            client.release();
        }
    });

    // --------------------------------------------------
    // GET /api/christmas/cosmetics/:userId
    // --------------------------------------------------

    router.get('/cosmetics/:userId', async (req, res) => {
        try {
            const requestedUserId = req.params.userId;
            const year = getChristmasYear();

            const result = await pool.query(
                `SELECT name_color, badge
                 FROM christmas_cosmetics
                 WHERE user_id = $1 AND year = $2
                 LIMIT 1`,
                [requestedUserId, year]
            );

            if (!result.rowCount) {
                return res.json({
                    christmas: false,
                    nameColor: null,
                    badge: null
                });
            }

            return res.json({
                christmas: true,
                nameColor: result.rows[0].name_color,
                badge: result.rows[0].badge
            });
        } catch (error) {
            console.error('[Christmas] Cosmetics error:', error);

            return res.status(500).json({
                error: 'Could not load Christmas cosmetics.'
            });
        }
    });

    app.use('/api/christmas', router);

    console.log('[Christmas] Routes registered at /api/christmas');
}

module.exports = {
    registerChristmasRoutes
};

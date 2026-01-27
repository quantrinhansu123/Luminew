/**
 * Vercel Serverless Function for F3 Daily Backup Cron Job
 * Scheduled to run at 7 AM and 12 PM Vietnam time (0h and 5h UTC)
 * 
 * Endpoint: /api/cron/daily-backup
 * Method: GET
 */

export default async function handler(req, res) {
    // Security: Verify cron secret token
    const authHeader = req.headers['authorization'];
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    if (authHeader !== expectedAuth) {
        console.error('Unauthorized cron attempt');
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing authorization token'
        });
    }

    console.log('🔐 Cron job authorized, starting backup...');

    try {
        // Dynamic import for ES modules in serverless
        const backupModule = await import('../../src/services/f3DailyBackupService.js');
        const { performDailyBackup } = backupModule;

        const result = await performDailyBackup('cron');

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            ...result
        });

    } catch (error) {
        console.error('❌ Cron backup failed:', error);

        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

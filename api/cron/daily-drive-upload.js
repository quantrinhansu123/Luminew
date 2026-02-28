/**
 * Vercel Serverless Function for Daily Google Drive Upload Cron Job
 * Scheduled to run at 11 PM Vietnam time (16h UTC)
 * 
 * Endpoint: /api/cron/daily-drive-upload
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

    console.log('🔐 Cron job authorized, starting daily Drive upload...');

    try {
        // Dynamic import for ES modules in serverless
        const uploadModule = await import('../../src/services/dailyDriveUploadService.js');
        const { performDailyDriveUpload } = uploadModule;

        const result = await performDailyDriveUpload('cron');

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            ...result
        });

    } catch (error) {
        console.error('❌ Cron Drive upload failed:', error);

        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

import express from "express";
import ReportController from '../controller/report.controller.js';

const router = express.Router();
const reportController = new ReportController();

// ===== REPORT GENERATION ROUTES =====
/**
 * GET /api/report/available
 * Lấy danh sách các loại báo cáo có sẵn
 */
router.get('/available', reportController.getAvailableReports);

/**
 * GET /api/report/generate?tableName=string
 * Tạo báo cáo theo tableName
 * Query: tableName (string)
 */
router.get('/generate', reportController.generateReport);

export default router;

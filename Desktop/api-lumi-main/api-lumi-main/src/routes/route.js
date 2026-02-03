import express from "express";
import sheetRoute from "./sheet.route.js";
import reportRoute from "./report.route.js";
let router = express.Router();
let initWebRoutes = (app, io) => {
    router.use(`/sheet`, sheetRoute);
    router.use(`/report`, reportRoute);
    return app.use('/', router);
}

export default initWebRoutes;

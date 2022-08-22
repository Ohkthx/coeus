import express from 'express';

// Create cmd router, import cmd controller.
const cmdRouter = express.Router();
const cmdController = require('../controllers/command-controller');

// Cmd router handling data.
cmdRouter.get('/commands', cmdController.getCmds);
cmdRouter.get('/commands/:cmdId', cmdController.getCmd);
cmdRouter.post('/', cmdController.procCmd);

export = cmdRouter;

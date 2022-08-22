import {Request, Response, NextFunction} from 'express';
import {ConsoleState, newResponse} from '../../commands';

async function getCmds(_req: Request, res: Response, _: NextFunction) {
  return res.status(200).json(ConsoleState.getCommands(true));
}

async function getCmd(req: Request, res: Response, _: NextFunction) {
  const cmdId: string = req.params.cmdId;

  let command = ConsoleState.getCommand(cmdId);
  if (!command) {
    // Invalid command.
    return res.status(404).json({message: 'not found'});
  }

  return res.status(200).json(command);
}

async function procCmd(req: Request, res: Response, _: NextFunction) {
  let response = newResponse(501, 'not implemented');
  try {
    const {payload} = req.body;
    response = await ConsoleState.parse(payload);
  } catch (_err) {
    response = newResponse(400, 'invalid request');
  }

  return res.status(response.code).json(response);
}

module.exports = {getCmd, getCmds, procCmd};

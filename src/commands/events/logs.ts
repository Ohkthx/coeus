import {Command, Event, newResponse, Response} from '..';
import {LogModel} from '../../models/log';

module.exports = <Event>{
  name: 'logs',
  async execute(command: Command): Promise<Response> {
    const logs = await LogModel.find({}, null, {lean: true})
      .sort({created: -1})
      .limit(20);

    // Strip the '_v' property and sort based on date.
    logs.map((l) => delete l.__v);
    logs.sort((a, b) => (a.created > b.created ? -1 : 1));

    const res = `[command 'completed'] `;
    const retData = {logs};

    return newResponse(200, res, retData);
  },
};

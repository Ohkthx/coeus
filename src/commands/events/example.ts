import {Command, Event, newResponse, Response} from '..';

module.exports = <Event>{
  name: 'example',
  async execute(command: Command): Promise<Response> {
    return newResponse(200, `Congratulations, you've performed a command.`);
  },
};

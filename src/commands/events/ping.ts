import {abs} from 'mathjs';
import {Command, Event, newResponse, Response} from '..';

module.exports = <Event>{
  name: 'ping',
  async execute(command: Command): Promise<Response> {
    const latency = new Date().getTime() - new Date(command.created).getTime();
    return newResponse(200, `Pong! Latency: ${abs(latency)}ms.`);
  },
};

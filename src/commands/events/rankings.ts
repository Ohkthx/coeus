import {Command, Event, newResponse, Response} from '..';
import {State} from '../../core';
import {ProductRanking} from '../../core/rank';
import {ConsoleState} from '../state';

interface RankingsOpts {
  products: string[];
  count: number;
  movement: number;
}

module.exports = <Event>{
  name: 'rankings',
  async execute(command: Command): Promise<Response> {
    if (command.params.length === 0) {
      return newResponse(404, `no parameters passed`);
    }

    let res: string = '';
    let code: number = 400;
    let retData: ProductRanking[] = [];

    for (const param of command.params) {
      switch (param) {
        case 'get':
          // Extract the parameters.
          const data = ConsoleState.extractData(command) as RankingsOpts;
          if (!data.count) data.count = 0;
          if (!data.products) data.products = [];

          if (data.products.length > 0) {
            const rankings = State.getSortedRankings();
            retData = rankings.filter((r) =>
              data.products.includes(r.productId),
            );
          } else {
            retData = State.getSortedRankings(data.count);
          }

          res = `${res}[${param}: 'completed'] `;
          code = 200 < code ? 200 : code;
          break;
        default:
          res = `${res}[${param}: 'invalid parameter'] `;
          code = 501 < code ? 501 : code;
      }
    }

    return newResponse(code, res, retData);
  },
};

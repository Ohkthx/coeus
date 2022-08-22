import {Command, Event, newResponse, Response} from '..';
import {Product} from '../../models';
import {Products} from '../../product';

module.exports = <Event>{
  name: 'productInfo',
  async execute(command: Command): Promise<Response> {
    if (command.params.length === 0) {
      return newResponse(404, `no parameters passed`);
    }

    let res: string = 'invalid request';
    let code: number = 400;
    let retData: Product[] = [];

    for (const param of command.params) {
      const product = Products.get(param);
      if (product) {
        if (code !== 200) {
          res = '';
          code = 200;
        }
        retData.push(product);
      }
    }

    return newResponse(code, res, retData);
  },
};

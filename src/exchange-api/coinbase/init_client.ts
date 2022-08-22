import {CoinbasePro} from 'coinbase-pro-node';
import {parseBoolean} from '../../utils';

/**
 * Initializes a Coinbase client for API access.
 *
 * @param {Boolean} useAccount - Authenticate with coinbase api or not.
 * @returns {CoinbasePro} A Coinbase client to use for API access.
 */
export function initCoinbaseClient(useAccount: boolean): CoinbasePro {
  if (useAccount) {
    return new CoinbasePro({
      apiKey: process.env.COINBASE_API_KEY!,
      apiSecret: process.env.COINBASE_API_SECRET!,
      passphrase: process.env.COINBASE_PASSPHRASE!,
      useSandbox: parseBoolean(process.env.USE_SANDBOX),
    });
  }

  return new CoinbasePro({
    apiKey: '',
    apiSecret: '',
    passphrase: '',
    useSandbox: parseBoolean(process.env.USE_SANDBOX),
  });
}

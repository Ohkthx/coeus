# COEUS

A retired private project that collected trading pair data from the Coinbase API and performed technical analysis. It supported several indicators such as RSI, EMA, SMA, etc. 

## Data Collection

The user would need to specify the candle size and maximum length of collection to maintain. 1 minute candles with 365 days worth of data is was roughly 45million candles that would be processed every 5 minutes. 

The method for collecton involded querying the Coinbase API for all trading pairs that involved USD. The span between the query could be modified, but the sweet spot was 5min or 10min intervals. It would iterate each pair, pulling all missed candles, then perform the technical analysis starting from the current time to however your maximum length was set.

## Information Displaying

After each collection and processing, a ranking structure would be recreated and displayed to Discord. Invidual points of interest for trading pairs such as overbought, oversold, golden crosses, death crosses, etc would be sent to another channel to notify users.

## Discord Commands

##### Admin Commands

| command | options | purpose |
|---------|---------|---------|
| filter | movement, close, volume, over{bought, sold} | Filtered the results of the rankings |


#### Get Commands

| command | req. options | purpose |
|---------|---------|---------|
| rank | product | The current ranking of the product. |
| product | id | Product information. |
| currency | id | Currency information. |
| indicators | id | Current indicators for the product. |
| update | - | Displays the current update (versioning) |
| filter | - | Displays the current filter placed on results. |


#### Misc

| command | req. options | purpose |
|---------|---------|---------|
| last | - | Performs the last command issued by the user. |
| ping | - | Pings the server, checking latency. |


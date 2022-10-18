import {Pool, createPool} from 'mysql';
import {SimpleCandle} from './models';

export class CandleDb {
  private static connPool: Pool | undefined;
  private static dbName: string = 'candles';
  private static statuses = new Map<string, boolean>();

  /**
   * Used to initialize the MySQL database and update the time.
   */
  static async spawnConnection() {
    return CandleDb.getConnection().then(async (success) => {
      if (success) return CandleDb.setDbUTC();
      return success;
    });
  }

  /**
   * Kills the MySQL database connection.
   */
  static async killConnection() {
    if (!CandleDb.connPool) return;
    CandleDb.connPool.end();
  }

  /**
   * Converts an ISO 8601 time to a MySQL friendly UTC datetime.
   *
   * @param {string} iso - ISO 8601 to convert.
   * @returns {string} Date/Time format for UTC.
   */
  static iso8601ToUTC(iso: string): string {
    return iso.replace(/T/, ' ').replace(/\..+/, '');
  }

  /**
   * Creates a table name, removing special characters and setting to lowercase.
   *
   * @param {string} productId - Id of the product/pair to set the table name as.
   * @returns {string} Formatting table name.
   */
  static toTableName(productId: string): string {
    return productId.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  }

  /**
   * Checks if there is data being currently saved to the database.
   *
   * @returns {boolean} True if database is in use. False if not actions occurring.
   */
  static isSaving(): boolean {
    for (const [_, value] of CandleDb.statuses.entries()) {
      if (value) return true;
    }

    return false;
  }

  /**
   * Gets the connection pool for the database.
   */
  private static async getConnection(): Promise<Pool> {
    if (!CandleDb.connPool) {
      const pool = createPool({
        host: 'localhost',
        user: 'root',
        database: CandleDb.dbName,
        waitForConnections: true,
        connectionLimit: 100,
        queueLimit: 250,
      });

      const success = new Promise<boolean>((resolve) => {
        pool.getConnection((error) => {
          if (error) {
            resolve(false);
            return;
          }
          resolve(true);
        });
      });

      if (!(await success)) {
        throw new Error(`could not establish connection to sql.`);
      }

      CandleDb.connPool = pool;
    }

    return CandleDb.connPool;
  }

  /**
   * Sets the MySQL database to UTC time format.
   */
  private static async setDbUTC(): Promise<boolean> {
    const conn = await CandleDb.getConnection();
    return new Promise<boolean>((resolve) => {
      conn.query(`SET GLOBAL time_zone = '+00:00'`, (error, results: []) => {
        if (error) {
          resolve(false);
        } else if (results && results.length > 0) {
          resolve(true);
        } else resolve(false);
      });
    });
  }

  /**
   * Check if the database exists.
   */
  private static async dbExists(db: string): Promise<boolean> {
    const conn = await CandleDb.getConnection();
    return new Promise<boolean>((resolve) => {
      conn.query(
        `SHOW DATABASES LIKE '${db.toLowerCase()}'`,
        (error, results: []) => {
          if (error) {
            resolve(false);
          } else if (results && results.length > 0) {
            resolve(true);
          } else resolve(false);
        },
      );
    });
  }

  /**
   * Checks if a table exists.
   */
  private static async tableExists(
    db: string,
    table: string,
  ): Promise<boolean> {
    const conn = await CandleDb.getConnection();
    return new Promise<boolean>((resolve) => {
      conn.query(
        `SELECT 1 ` +
          `FROM information_schema.tables ` +
          `WHERE table_schema = "${db.toLowerCase()}" ` +
          `AND table_name = "${table.toLowerCase()}"`,
        (error, results: []) => {
          if (error) {
            resolve(false);
          } else if (results && results.length > 0) {
            resolve(true);
          } else resolve(false);
        },
      );
    });
  }

  /**
   * Checks if an index exists for a table.
   */
  private static async indexExists(table: string): Promise<boolean> {
    const conn = await CandleDb.getConnection();
    return new Promise<boolean>((resolve) => {
      conn.query(
        `SHOW INDEX ` +
          `FROM ${table.toLowerCase()} ` +
          `WHERE Key_name = 'idx_openTime'`,
        (error, results: []) => {
          if (error) {
            resolve(false);
          } else if (results && results.length > 0) {
            resolve(true);
          } else resolve(false);
        },
      );
    });
  }

  /**
   * Creates a blank table.
   */
  private static async tableCreate(
    db: string,
    table: string,
  ): Promise<boolean> {
    const exists = await CandleDb.tableExists(db, table);
    if (exists) return true;

    const conn = await CandleDb.getConnection();
    return new Promise<boolean>((resolve) => {
      conn.query(
        `CREATE TABLE ${table} ` +
          `( openTimeInISO DATETIME, ` +
          `low DOUBLE, high DOUBLE, ` +
          `open DOUBLE, close DOUBLE, ` +
          `volume DOUBLE)`,
        async (error, results: []) => {
          if (error) {
            resolve(false);
          } else if (results) {
            await CandleDb.indexCreate(table);
            resolve(true);
          } else resolve(false);
        },
      );
    });
  }

  /**
   * Creates the index for the table.
   */
  private static async indexCreate(table: string): Promise<boolean> {
    // Get the connection to the database and check if table exists.
    const conn = await CandleDb.getConnection();
    const exists = await CandleDb.indexExists(table);
    if (exists) return true;

    return new Promise<boolean>((resolve) => {
      conn.query(
        `CREATE INDEX idx_openTime ` +
          `ON ${table.toLowerCase()} (openTimeInISO)`,
        (error, results: []) => {
          if (error) {
            resolve(false);
          } else if (results) resolve(true);
          else resolve(false);
        },
      );
    });
  }

  /**
   * Verifies that the table and indexes exist for a particular product.
   *
   * @param {string} productId - Id of the product/pair to check for.
   * @param {boolean} create - If the do not exists, create it.
   * @returns {Promise<boolean>} If data is missing and not recreated, returns false.
   */
  static async integrityCheck(
    productId: string,
    create: boolean,
  ): Promise<boolean> {
    // Clean the tablename from special characters.
    productId = CandleDb.toTableName(productId);
    let success: boolean = false;

    // Check if table exists.
    let exists = await CandleDb.tableExists(CandleDb.dbName, productId);
    if (!exists && !create) return false;
    else if (!exists) {
      // Create the table.
      success = await CandleDb.tableCreate(CandleDb.dbName, productId);
      if (!success) {
        throw new Error(
          `failed integrity check: ${productId}, could not create table.`,
        );
      }
    }

    // Check if index exists.
    exists = await CandleDb.indexExists(productId);
    if (!exists && !create) return false;
    else if (!exists) {
      // Create the index.
      success = await CandleDb.indexCreate(productId);
      if (!success) {
        throw new Error(
          `failed integrity check: ${productId}, could not create index.`,
        );
      }
    }

    return true;
  }

  /**
   * Saves candles to MySQL database.
   *
   * @param {string} productId - Id of the product/pair to save, used as the table name.
   * @param {SimpleCandle[]} candles - Candle data to save.
   * @param {boolean} createTable - Create the table if it does not exist.
   * @returns {Promise<boolean} Success: true, Failure: false
   */
  static async saveCandles(
    productId: string,
    candles: SimpleCandle[],
    createTable: boolean,
  ): Promise<boolean> {
    // Clean the tablename from special characters.
    productId = CandleDb.toTableName(productId);

    // Get the connection to the database and check if table exists.
    const conn = await CandleDb.getConnection();
    const tableExists = await CandleDb.tableExists(CandleDb.dbName, productId);

    // Decide to create the table if it is missing.
    if (!tableExists && createTable) {
      const created = await CandleDb.tableCreate('candles', productId);
      if (!created) return false;
    } else if (!tableExists) return false;

    return new Promise<boolean>((resolve) => {
      CandleDb.statuses.set(productId, true);
      conn.query(
        `INSERT INTO ${productId} ` +
          `(openTimeInISO, low, high, open, close, volume) VALUES ?`,
        [
          candles.map((c) => [
            CandleDb.iso8601ToUTC(c.openTimeInISO),
            c.low,
            c.high,
            c.open,
            c.close,
            c.volume,
          ]),
        ],
        (error) => {
          if (error) resolve(false);
          else resolve(true);
          CandleDb.statuses.set(productId, false);
        },
      );
    });
  }

  /**
   * Loads candles from MySQL database starting from oldest to newest.
   *
   * @param {string} productId - Id of the product/pair to retrieve.
   * @param {string} afterISO - Optional: Only grab candles newer than date provided.
   * @returns {Promise<SimpleCandle[]>} Array of candles obtained from database.
   */
  static async loadCandles(
    productId: string,
    afterISO?: string,
  ): Promise<SimpleCandle[]> {
    // Clean the tablename from special characters.
    productId = CandleDb.toTableName(productId);

    // Get the connection to the database and check if table exists.
    const conn = await CandleDb.getConnection();
    const tableExists = await CandleDb.tableExists(CandleDb.dbName, productId);
    if (!tableExists) return [];

    // If an afterISO was provided, filter based on it.
    let queryExt: string = '';
    if (afterISO && afterISO != '') {
      const datetime = CandleDb.iso8601ToUTC(afterISO);
      queryExt = ` WHERE openTimeInISO > '${datetime}'`;
    }

    return new Promise<SimpleCandle[]>((resolve) => {
      conn.query(
        `SELECT * FROM ${productId.toLowerCase()}` +
          `${queryExt}` +
          ` ORDER BY openTimeInISO ASC`,
        (error, results: SimpleCandle[]) => {
          if (error) {
            resolve([]);
          } else if (results && results.length > 0) {
            results = results.map((c) => {
              c.openTimeInISO = new Date(c.openTimeInISO).toISOString();
              return c;
            });
            resolve(results);
          } else resolve([]);
        },
      );
    });
  }
}

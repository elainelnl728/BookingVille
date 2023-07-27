import { PoolConnection } from 'mysql2/promise';
import {
  ConditionGroup,
  Condition,
  QueryRequest,
  InsertRequest,
  UpdateRequest,
} from '../Model';

/**
 * Class to translate JSON payloads to SQL queries.
 */
export class DBManager {
  /**
   * Basic Database query.
   */
  static async query(conn: PoolConnection, queryRequest: QueryRequest) {
    const from = 'FROM ' + queryRequest.tables.join(', ').toUpperCase();
    const where = queryRequest.conditions
      ? ' WHERE ' + this.buildConditionQuery(queryRequest.conditions)
      : '';

    let sqlQuery = `SELECT * ${from} ${where}`;

    if (queryRequest.orderBy && queryRequest.orderBy.length != 0) {
      sqlQuery += ' ORDER BY';
      const orderBy = queryRequest.orderBy[0];

      // handle the first order by
      sqlQuery += ` ${orderBy.attr} ${orderBy.asc ? 'ASC' : 'DESC'} `;

      for (let i = 1; i < queryRequest.orderBy.length; ++i) {
        const orderBy = queryRequest.orderBy[i];
        sqlQuery += `, ${orderBy.attr} ${orderBy.asc ? 'ASC' : 'DESC'}`;
      }
    }

    if (queryRequest.limit) {
      sqlQuery += ` LIMIT ${queryRequest.limit} `;
    }

    sqlQuery += ';';
    console.info('[SQL QUERY]: ' + sqlQuery);

    return conn.query(sqlQuery);
  }

  /**
   * Insert a single record into a database table.
   */
  static async insert(conn: PoolConnection, insertRequest: InsertRequest) {
    let fields = '';
    let values = '';

    const fieldMap = insertRequest.values;
    const fieldKeys = Object.keys(fieldMap);

    // handle the first field.
    const key = fieldKeys[0];

    fields += key;
    values += this.toSQLValue(fieldMap[key]);

    for (let i = 1; i < fieldKeys.length; ++i) {
      // handle the following fields
      const key = fieldKeys[i];

      fields += `, ${key}`;
      values += ', ' + this.toSQLValue(fieldMap[key]);
    }

    const sqlQuery = `INSERT INTO ${insertRequest.table} (${fields}) VALUES(${values});`;
    console.info('[SQL INSERT]: ' + sqlQuery);

    return conn.query(sqlQuery);
  }

  /**
   * Update a single database record or a table.
   */
  static async update(conn: PoolConnection, updateRequest: UpdateRequest) {
    let keyValues = '';

    const fieldMap = updateRequest.values;
    const fieldKeys = Object.keys(fieldMap);

    // handle the first field.
    const key = fieldKeys[0];

    keyValues += key + ' = ';
    keyValues += this.toSQLValue(fieldMap[key]);

    for (let i = 1; i < fieldKeys.length; ++i) {
      // handle the following fields
      const key = fieldKeys[i];

      keyValues += `, ${key} = `;
      keyValues += ', ' + this.toSQLValue(fieldMap[key]);
    }

    // handle WHERE clause
    const where = updateRequest.conditions
      ? ' WHERE ' + this.buildConditionQuery(updateRequest.conditions)
      : '';

    const sqlQuery = `UPDATE ${updateRequest.table} SET ${keyValues} ${where};`;
    console.info('[SQL UPDATE]: ' + sqlQuery);

    return conn.query(sqlQuery);
  }

  /**
   * Build SQL WHERE clause.
   *
   * This is a recersive function and it's kind of complicated because we
   * need to handle both associations and precedence.
   */
  private static buildConditionQuery(conditions: ConditionGroup): string {
    let where = ' ( ';
    const condOrGroup = conditions.cond[0];

    // check if the object type is ConditionGroup or Condition
    if ((condOrGroup as any).op) {
      const cond = condOrGroup as Condition;

      // ignore the association of the first Condition
      where += `${cond.left} ${cond.op} ${cond.right}`;

      for (let i = 1; i < conditions.cond.length; ++i) {
        const cond = conditions.cond[i] as Condition;
        where += ` ${cond.asso} ${cond.left} ${cond.op} ${cond.right} `;
      }
    } else {
      // add the leading association of the first ConditionGroup only if it's NOT.
      const group = condOrGroup as ConditionGroup;
      if (group.asso === 'NOT') {
        where += ' NOT ';
      }

      // recursively build the first condition in groups
      where += this.buildConditionQuery(group);

      // recersively build the rest sub condition groups
      for (let i = 1; i < conditions.cond.length; ++i) {
        const group = conditions.cond[i] as ConditionGroup;
        where += ` ${group.asso} `;
        where += this.buildConditionQuery(group as ConditionGroup);
      }
    }

    return where + ' ) ';
  }

  /**
   * Return the Date string value used in SQL statement.
   *
   * e.g. `2021-04-15THH:MM:SSS`
   */
  static toDateTimeString(date: string | Date): string {
    return `'${new Date(date).toISOString()}'`;
  }

  /**
   * Return the Date string value used in SQL statement.
   *
   * e.g. `2021-04-15`
   */
  static toDateString(date: string | Date): string {
    return `'${new Date(date).toISOString().split('T')[0]}'`;
  }

  /**
   * Return the value string to be used in SQL queries.
   */
  static toSQLValue(value: any): string {
    if (!value) {
      return 'NULL';
    } else if (typeof value === 'string') {
      if (value.startsWith(`'`) && value.endsWith(`'`)) {
        return value;
      } else {
        return `'${value}'`;
      }
    }
    return value;
  }
}

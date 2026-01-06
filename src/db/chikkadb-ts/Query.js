/**
 * Builds SQL queries from Mongoose-like query objects
 */
class Query {
  constructor(tableName, model) {
    this.tableName = tableName;
    this.model = model;
    this.conditions = {};
    this.selectFields = ['*'];
    this.limitValue = null;
    this.skipValue = 0;
    this.sortValue = {};
    this.updateData = {};
  }

  where(conditions) {
    this.conditions = { ...this.conditions, ...conditions };
    return this;
  }

  select(fields) {
    if (typeof fields === 'string') {
      this.selectFields = fields.split(' ').filter(f => f);
    } else if (Array.isArray(fields)) {
      this.selectFields = fields;
    }
    return this;
  }

  limit(n) {
    this.limitValue = n;
    return this;
  }

  skip(n) {
    this.skipValue = n;
    return this;
  }

  sort(sortObj) {
    this.sortValue = sortObj;
    return this;
  }

  set(data) {
    this.updateData = data;
    return this;
  }

  _buildWhereClause() {
    const clauses = [];
    const params = [];

    Object.entries(this.conditions).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        clauses.push(`${key} IS NULL`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Handle operators like $gt, $lt, $in, etc.
        Object.entries(value).forEach(([op, opValue]) => {
          if (op === '$eq') {
            clauses.push(`${key} = ?`);
            params.push(opValue);
          } else if (op === '$ne') {
            clauses.push(`${key} != ?`);
            params.push(opValue);
          } else if (op === '$gt') {
            clauses.push(`${key} > ?`);
            params.push(opValue);
          } else if (op === '$gte') {
            clauses.push(`${key} >= ?`);
            params.push(opValue);
          } else if (op === '$lt') {
            clauses.push(`${key} < ?`);
            params.push(opValue);
          } else if (op === '$lte') {
            clauses.push(`${key} <= ?`);
            params.push(opValue);
          } else if (op === '$in') {
            const placeholders = Array(opValue.length).fill('?').join(',');
            clauses.push(`${key} IN (${placeholders})`);
            params.push(...opValue);
          } else if (op === '$nin') {
            const placeholders = Array(opValue.length).fill('?').join(',');
            clauses.push(`${key} NOT IN (${placeholders})`);
            params.push(...opValue);
          } else if (op === '$regex') {
            clauses.push(`${key} LIKE ?`);
            params.push(`%${opValue}%`);
          }
        });
      } else {
        clauses.push(`${key} = ?`);
        params.push(value);
      }
    });

    return {
      sql: clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '',
      params
    };
  }

  _buildSortClause() {
    if (Object.keys(this.sortValue).length === 0) return '';
    
    const sortParts = Object.entries(this.sortValue).map(([key, direction]) => {
      return `${key} ${direction === 1 ? 'ASC' : 'DESC'}`;
    });

    return 'ORDER BY ' + sortParts.join(', ');
  }

  _buildLimitClause() {
    let clause = '';
    if (this.skipValue > 0) {
      clause += ` OFFSET ${this.skipValue}`;
    }
    if (this.limitValue !== null) {
      clause = ` LIMIT ${this.limitValue}` + clause;
    }
    return clause;
  }

  buildSelectSQL() {
    const { sql: whereClause, params } = this._buildWhereClause();
    const sortClause = this._buildSortClause();
    const limitClause = this._buildLimitClause();
    const selectParts = this.selectFields.includes('*') ? '*' : this.selectFields.join(', ');

    const sql = `SELECT ${selectParts} FROM ${this.tableName} ${whereClause} ${sortClause} ${limitClause}`.trim();
    return { sql, params };
  }

  buildCountSQL() {
    const { sql: whereClause, params } = this._buildWhereClause();
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`.trim();
    return { sql, params };
  }

  buildUpdateSQL() {
    const { sql: whereClause, params: whereParams } = this._buildWhereClause();
    
    const updateParts = [];
    const updateParams = [];
    
    Object.entries(this.updateData).forEach(([key, value]) => {
      updateParts.push(`${key} = ?`);
      updateParams.push(value);
    });

    if (this.model && this.model.schema && this.model.schema.timestamps) {
      updateParts.push(`updatedAt = ?`);
      updateParams.push(new Date().toISOString());
    }

    const sql = `UPDATE ${this.tableName} SET ${updateParts.join(', ')} ${whereClause}`.trim();
    return { sql, params: [...updateParams, ...whereParams] };
  }

  buildDeleteSQL() {
    const { sql: whereClause, params } = this._buildWhereClause();
    const sql = `DELETE FROM ${this.tableName} ${whereClause}`.trim();
    return { sql, params };
  }
}

module.exports = Query;

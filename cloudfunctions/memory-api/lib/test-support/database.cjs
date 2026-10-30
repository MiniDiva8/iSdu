'use strict';

function createDatabase(seed = {}, { wrapped = false, arrayReads = false } = {}) {
  let collections = new Map(
    Object.entries(seed).map(([name, documents]) => [
      name,
      new Map(documents.map((document) => [document._id, structuredClone(document)])),
    ]),
  );
  let pending = Promise.resolve();
  let failedCollection = '';
  const querySizes = [];
  const transactionSizes = [];
  const copy = (value) => structuredClone(value);
  function matches(actual, expected) {
    if (!expected || typeof expected !== 'object') return actual === expected;
    if (expected.operation === 'gt') return actual > expected.value;
    if (expected.operation === 'lt') return actual < expected.value;
    if (expected.operation === 'gte') return actual >= expected.value;
    if (expected.operation === 'lte') return actual <= expected.value;
    if (expected.operation === 'in') return expected.value.includes(actual);
    if (expected.operation === 'and') return expected.value.every((item) => matches(actual, item));
    return false;
  }
  function matchesQuery(document, query) {
    if (query.operation === 'queryAnd')
      return query.value.every((item) => matchesQuery(document, item));
    if (query.operation === 'queryOr')
      return query.value.some((item) => matchesQuery(document, item));
    return Object.entries(query).every(([key, value]) => matches(document[key], value));
  }
  function collectionFor(source, name, operationCount) {
    if (!source.has(name)) source.set(name, new Map());
    const documents = source.get(name);
    function tick() {
      if (operationCount && ++operationCount.count > 100) {
        throw new Error('Transaction exceeds 100 document operations');
      }
    }
    function query(where = {}, limit = 100, order = []) {
      return {
        where: (next) => query(next, limit, order),
        limit: (next) => {
          if (next > 100) throw new Error('Query exceeds 100 documents');
          return query(where, next, order);
        },
        orderBy: (field, direction) => query(where, limit, [...order, [field, direction]]),
        async get() {
          if (operationCount) throw new Error('Transactions support doc, not where');
          const filtered = [...documents.values()].filter((document) =>
            matchesQuery(document, where),
          );
          filtered.sort((left, right) => {
            for (const [field, direction] of order) {
              if (left[field] === right[field]) continue;
              return (left[field] < right[field] ? -1 : 1) * (direction === 'desc' ? -1 : 1);
            }
            return 0;
          });
          const data = filtered.slice(0, limit);
          querySizes.push(data.length);
          return { data: copy(data) };
        },
      };
    }
    return {
      ...query(),
      async add({ data }) {
        tick();
        if (documents.has(data._id)) throw new Error('Duplicate document');
        documents.set(data._id, copy(data));
        return { _id: data._id };
      },
      doc(id) {
        return {
          async get() {
            tick();
            const value = documents.get(id);
            return { data: arrayReads ? (value ? [copy(value)] : []) : copy(value ?? null) };
          },
          async set({ data }) {
            tick();
            if (failedCollection === name) {
              failedCollection = '';
              throw new Error('Simulated write failure');
            }
            documents.set(id, { ...copy(data), _id: id });
            return { stats: { created: 1 } };
          },
          async update({ data }) {
            tick();
            if (!documents.has(id)) throw new Error('Updating missing document');
            documents.set(id, { ...documents.get(id), ...copy(data), _id: id });
            return { stats: { updated: 1 } };
          },
          async remove() {
            tick();
            documents.delete(id);
            return { stats: { removed: 1 } };
          },
        };
      },
    };
  }
  const command = Object.fromEntries(
    ['gt', 'gte', 'lt', 'lte', 'in'].map((operation) => [
      operation,
      (value) => ({
        operation,
        value,
        and(next) {
          return { operation: 'and', value: [{ operation, value }, next] };
        },
      }),
    ]),
  );
  command.and = (...value) => ({ operation: 'queryAnd', value });
  command.or = (...value) => ({ operation: 'queryOr', value });
  return {
    command,
    collection: (name) => collectionFor(collections, name),
    get collections() {
      return collections;
    },
    querySizes,
    transactionSizes,
    failNextWrite(collection) {
      failedCollection = collection;
    },
    async runTransaction(callback) {
      const previous = pending;
      let release;
      pending = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = copy(collections);
      const operationCount = { count: 0 };
      try {
        const result = await callback({
          collection: (name) => collectionFor(snapshot, name, operationCount),
        });
        for (const [name, documents] of snapshot) {
          if (!collections.has(name)) collections.set(name, new Map());
          const target = collections.get(name);
          target.clear();
          for (const [id, value] of documents) target.set(id, value);
        }
        transactionSizes.push(operationCount.count);
        return wrapped ? { result, errMsg: 'runTransaction:ok' } : result;
      } finally {
        release();
      }
    },
  };
}

module.exports = { createDatabase };

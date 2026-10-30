'use strict';

function createDatabase(
  seed = {},
  { wrappedTransactions = false, arrayDocumentReads = false } = {},
) {
  let collections = new Map(
    Object.entries(seed).map(([name, items]) => [
      name,
      new Map(items.map((item) => [item._id, structuredClone(item)])),
    ]),
  );
  let pending = Promise.resolve();
  let failKind = '';
  let returnedFailureKind = '';
  let failedRead = '';
  let failRemoval = false;
  let transactionCount = 0;
  const queryLimits = [];
  const transactionWrites = [];
  const copy = (value) => (value === undefined ? undefined : structuredClone(value));
  function collectionFor(source, name, transactional = false, operations = { count: 0 }) {
    if (!source.has(name)) source.set(name, new Map());
    const items = source.get(name);
    function tick() {
      if (transactional && ++operations.count > 100) throw new Error('transaction too large');
    }
    function writable(data) {
      tick();
      if (failKind && data?.kind === failKind) {
        failKind = '';
        throw new Error('simulated database write failure');
      }
      if (transactional) transactionWrites.push({ name, data: copy(data) });
    }
    function query(where = {}, maximum = 100, sorted = false) {
      return {
        where: (next) => query(next, maximum, sorted),
        orderBy: (field, direction) => {
          if (field !== '_id' || direction !== 'asc') throw new Error('unexpected order');
          return query(where, maximum, true);
        },
        limit: (next) => {
          queryLimits.push(next);
          if (next > 100) throw new Error('query too large');
          return query(where, next, sorted);
        },
        get: async () => {
          if (transactional) throw new Error('where is unavailable in transactions');
          let result = [...items.values()].filter((item) =>
            Object.entries(where).every(([key, value]) =>
              value && typeof value === 'object' && 'greaterThan' in value
                ? item[key] > value.greaterThan
                : item[key] === value,
            ),
          );
          if (sorted) result = result.sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
          return { data: copy(result.slice(0, maximum)) };
        },
      };
    }
    return {
      ...query(),
      doc(id) {
        return {
          async get() {
            tick();
            if (failedRead === name + '/' + id) {
              failedRead = '';
              return { code: 'DATABASE_REQUEST_FAILED', message: 'private provider failure' };
            }
            const item = items.get(id);
            return { data: arrayDocumentReads ? (item ? [copy(item)] : []) : copy(item ?? null) };
          },
          async set({ data }) {
            writable(data);
            if (returnedFailureKind && data.kind === returnedFailureKind) {
              returnedFailureKind = '';
              return { code: 'DATABASE_REQUEST_FAILED', message: 'private provider failure' };
            }
            items.set(id, { ...copy(data), _id: id });
            return { stats: { created: 1 } };
          },
          async update({ data }) {
            writable(data);
            const current = items.get(id);
            if (!current) throw new Error('updating missing document');
            items.set(id, { ...current, ...copy(data), _id: id });
            return { stats: { updated: 1 } };
          },
          async remove() {
            writable();
            if (failRemoval) {
              failRemoval = false;
              throw new Error('simulated remove failure');
            }
            items.delete(id);
            return { stats: { removed: 1 } };
          },
        };
      },
    };
  }
  return {
    command: { gt: (value) => ({ greaterThan: value }) },
    collection: (name) => collectionFor(collections, name),
    get collections() {
      return collections;
    },
    get transactionCount() {
      return transactionCount;
    },
    queryLimits,
    transactionWrites,
    failNextReturnedWriteOfKind(kind) {
      returnedFailureKind = kind;
    },
    failNextReadOf(collection, id) {
      failedRead = collection + '/' + id;
    },
    failNextRemove() {
      failRemoval = true;
    },
    failNextWriteOfKind(kind) {
      failKind = kind;
    },
    async runTransaction(callback) {
      const previous = pending;
      let release;
      pending = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = copy(collections);
      const operations = { count: 0 };
      transactionCount += 1;
      try {
        const result = await callback({
          collection: (name) => collectionFor(snapshot, name, true, operations),
        });
        collections = snapshot;
        return wrappedTransactions ? { result, errMsg: 'runTransaction:ok' } : result;
      } finally {
        release();
      }
    },
  };
}

module.exports = { createDatabase };

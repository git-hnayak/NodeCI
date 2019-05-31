const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require('../config/keys');

const redisUrl = keys.redisUrl;
const client = redis.createClient(redisUrl);

client.get = util.promisify(client.get);
client.hget = util.promisify(client.hget);

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function(option = {}) {
    this.useCache = true;
    this.hashKey = JSON.stringify(option.key || '');
    return this;
}

mongoose.Query.prototype.exec = async function() {
    // console.log('I am about to run a query');
    // console.log(this.getQuery());
    // console.log(this.mongooseCollection.name);

    if (!this.useCache) {
        return exec.apply(this, arguments);
    }

    const key = JSON.stringify(Object.assign({}, this.getQuery(), {
        collection: this.mongooseCollection.name
    }));

    //See if we have a value for 'key' in redis
    const cachedValue = await client.hget(this.hashKey, key);

    //If we do, return that
    if (cachedValue) {
        console.log(cachedValue);
        const doc = JSON.parse(cachedValue);

        return Array.isArray(doc) ? 
            doc.map(d => new this.model(d))
            : new this.model(doc);
    }

    //Otherwise issue the query and store the result in redis
    const result = await exec.apply(this, arguments);

    client.hset(this.hashKey, key, JSON.stringify(result));
    return result;
}

module.exports = {
    clearCache(hashKey) {
        client.del(JSON.stringify(hashKey));
    }
}
'use strict';

import async from "async"
import { BitcoinProvider } from "./BitcoinProvider.js";
import https from "https";
import zlib from "zlib";

export class BlockchainComBitcoinProvider extends BitcoinProvider{

    constructor(cache) {
        super(cache)
        this.queue = async.queue(async (task) => {
            if(task.key){
                let cache = this.cache.getCache(task.key);
                if(cache !== null){
                    task.resolve(cache);
                    return;
                }
            }

            try{
                let options = {
                    headers: {
                        "Accept-Encoding": "gzip, deflate",
                        "Connection": "keep-alive"
                    }
                };
                let url = new URL(task.url);
                for(let key in url){
                    options[key] = url[key];
                }
                let req = https.request(options, (res) => {
                    let chunks = [];
                    let c = (err, data) => {
                        if(err){
                            task.reject(err);
                            callback();
                            return;
                        }

                        task.resolve(data);
                    };
                    res.on("data", (data) => {
                        chunks.push(data);
                    });

                    res.on("end", () => {
                        let buffer = Buffer.concat(chunks);
                        let encoding = res.headers['content-encoding'];
                        if (encoding === 'gzip'){
                            zlib.gunzip(buffer, function(err, decoded) {
                                c(err, decoded && decoded.toString());
                            });
                        } else if(encoding === 'deflate'){
                            zlib.inflate(buffer, function(err, decoded) {
                                c(err, decoded && decoded.toString());
                            })
                        } else {
                            c(null, buffer.toString());
                        }
                    });
                });

                req.end();
            }catch (e) {
                console.log(e);
                task.reject(e);
            }
        }, 8);
    }

    async getRawTransaction(txid){
        return new Promise((async (resolve, reject) => {
            if(txid.match(/^[0-9a-f]{64}$/i) === null){
                reject(new Error("Invalid transaction id " + txid))
                return;
            }
            let cache = await this.cache.getFileCache("rawtx", txid);
            if(cache !== null){
                resolve(cache);
                return;
            }

            this.queue.push({
                url: "https://blockchain.info/rawtx/"+txid+"?format=hex&cors=true",
                key: "rawtx." + txid,
                resolve: async (data) => {
                    if(data !== null && data.trim().match(/^[0-9a-f]+$/i) !== null){
                        await this.cache.setFileCache("rawtx", txid, data.trim());
                        resolve(data.trim())
                        return;
                    }
                    reject("Could not find transaction " + txid + ": " + data);
                },
                reject: reject
            });
        }));
    }



    async getTransactionBlockDetails(txid) {
        return new Promise((async (resolve, reject) => {
            if(txid.match(/^[0-9a-f]{64}$/i) === null){
                reject(new Error("Invalid transaction id " + txid))
                return;
            }
            let cache = await this.cache.getFileCache("txinfo", txid);
            if(cache !== null){
                resolve(cache);
                return;
            }



            this.queue.push({
                url: "https://blockchain.info/rawtx/"+txid+"?cors=true",
                key: "jsontx." + txid,
                resolve: async (data) => {
                    if(data !== null){
                        let json = JSON.parse(data);
                        if(json.reason){
                            reject("Could not find transaction " + txid + ": " + json.reason);
                            return;
                        }
                        let txinfo = {
                            hash: txid,
                            height: json.block_height > 0 ? json.block_height : null,
                            time: json.time
                        }

                        if(txinfo.height !== null){
                            await this.cache.setFileCache("txinfo", txid, txinfo);
                        }else{
                            this.cache.setCache("txinfo." + txid, txinfo);
                        }

                        this.cache.setCache("jsontx." + txid, data);
                        resolve(data)
                    }
                    reject("Could not find transaction " + txid + ": " + data);
                },
                reject: reject
            });
        }));
    }

    async getRawAddressHistory(address, limit){
        return new Promise((async (resolve, reject) => {
            let totalPages = 1;
            let entriesPerPage = 50;
            let maxTries = 3;

            let getPage = (page) => {
                return new Promise((async (resolve, reject) => {
                    this.queue.push({
                        url: "https://blockchain.info/rawaddr/"+address+"?limit="+entriesPerPage+"&offset="+(page * entriesPerPage)+"&cors=true",
                        resolve: async (data) => {
                            if(data !== null){
                                resolve(JSON.parse(data))
                            }
                            reject("Could not find page: " + data);
                        },
                        reject: reject
                    });
                }));
            }

            let entries = [];


            for(let page = 0; page < totalPages; ++page){
                let pageResult = null;
                for(let i = 0; i < maxTries; ++i){
                    try{
                        pageResult = await getPage(page);
                        break;
                    }catch (e) {

                    }
                }

                if(pageResult === null){
                    reject("Could not fetch page "+page+" for address" + address);
                    return;
                }

                for(let i in pageResult.txs){
                    entries.push(pageResult.txs[i].hash);
                }

                if((limit !== null && entries.length > limit) || pageResult.n_tx <= entries.length){
                    break;
                }
            }

            resolve(entries);
        }));
    }

    async getAddressTransactions(address, limit = null) {
        return new Promise(async (resolve, reject) => {
            let cache = this.cache.getCache("addresstx." + address);
            if (cache !== null) {
                resolve(cache);
                return;
            }
            let entries = null;
            try{
                entries = await this.getRawAddressHistory(address, limit);
            }catch (e) {
                reject(e)
                return;
            }

            let newList = [];
            let mapping = {};

            if (entries !== null && entries.length > 0) {
                for (let i in entries) {
                    if (mapping.hasOwnProperty(entries[i])) {
                        continue;
                    }

                    let tx = await this.getTransaction(entries[i]);
                    mapping[entries[i]] = tx;
                    newList.push(tx);
                    if(limit !== null && newList.length >= limit){
                        break;
                    }
                }

                this.cache.setCache("addresstx." + address, newList);
                resolve(newList);
            } else {
                resolve([]);
            }
        });
    }
}
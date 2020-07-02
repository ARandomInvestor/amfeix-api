'use strict';

import async from "async"
import crypto from "crypto";
import ElectrumClient from "electrum-client"
import * as bitcoinjs from "bitcoinjs-lib";
import { BitcoinProvider } from "./BitcoinProvider.js";

const bitcoin = "default" in bitcoinjs ? bitcoinjs.default : bitcoinjs;

export class FullNodeBitcoinProvider extends BitcoinProvider{

    constructor(cache, client, index) {
        super(cache)
        this.client = client;
        this.index = index;
        this.queue = async.queue(async (task) => {
            let cache = this.cache.getCache(task.key);
            if(cache !== null){
                task.resolve(cache);
                return;
            }

            try{
                let data = await this.client.command(task.method, ...task.parameters);
                task.resolve(data);
            }catch (e) {
                console.log(e);
                task.resolve(null);
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
                method: "getrawtransaction",
                parameters: [txid],
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
                method: "getrawtransaction",
                parameters: [txid, 1],
                key: "jsontx." + txid,
                resolve: async (data) => {
                    if(data !== null){
                        let txinfo = {
                            hash: txid,
                            height: data.confirmations > 0 ? (await this.getBlockInfo(data.blockhash)).height : null,
                            time: data.time
                        }

                        if(txinfo.height !== null){
                            await this.cache.setFileCache("txinfo", txid, txinfo);
                        }else{
                            this.cache.setCache("txinfo." + txid, txinfo);
                        }
                        this.cache.setCache("jsontx." + txid, data);
                        resolve(txinfo)
                    }
                    reject("Could not find transaction " + txid);
                },
                reject: reject
            });
        }));
    }


    async getBlockInfo(hash){
        return new Promise((async (resolve, reject) => {
            let cache = await this.cache.getFileCache("blockheader", hash);
            if (cache !== null) {
                resolve(cache);
                return;
            }

            this.queue.push({
                method: "getblockheader",
                parameters: [hash, true],
                key: "blockheader." + hash,
                resolve: async (data) => {
                    if(data !== null){
                        await this.cache.setFileCache("blockheader", hash, data);
                    }
                    resolve(data)
                },
                reject: reject
            });
        }))
    }

    async getBestBlockInfo(){
        return new Promise(((resolve, reject) => {
            let cache = this.cache.getCache("lastblock");
            if(cache !== null){
                resolve(cache);
                return;
            }

            this.queue.push({
                method: "getblockchaininfo",
                key: "lastblock",
                resolve: async (data) => {
                    if(data !== null){
                        this.cache.setCache("lastblock", data);
                    }
                    resolve(data)
                },
                reject: reject
            });
        }))
    }

    async getElectrumAddressHistory(address){
        if(this.index === null){
            throw new Error("this.index === null");
        }

        let tryReceive = async () => {
            let electrum = new ElectrumClient(this.index.port, this.index.host, this.index.ssl ? 'ssl' : 'tcp');
            await electrum.connect();

            let sha256 = (data) => {
                let hash = crypto.createHash('sha256');
                hash.update(data);
                return hash.digest();
            };

            let scripthash = sha256(bitcoin.address.toOutputScript(address)).reverse().toString("hex");
            try{
                let history = await electrum.request("blockchain.scripthash.get_history", [scripthash]);
                await electrum.close();
                return history;
            }catch (e) {
                await electrum.close();
                throw e;
            }
        }

        let history = null;
        let lastError = null;

        for(let retry = 0; retry < 5; ++retry){
            try{
                history = await tryReceive()
                break;
            }catch (e) {
                lastError = e;
            }
        }

        if(history === null){
            throw new Error("maxed out retries for " + address + ": " + lastError.message)
        }

        return history;
    }

    async getAddressTransactions(address, limit = null) {
        let cache = this.cache.getCache("addresstx." + address);
        if (cache !== null) {
            return cache;
        }
        let entries = null;
        try{
            entries = await this.getElectrumAddressHistory(address);
        }catch (e) {
            throw e;
        }

        let newList = [];
        let mapping = {};

        if (entries !== null && entries.length > 0) {
            for (let i in entries) {
                if (mapping.hasOwnProperty(entries[i].tx_hash)) {
                    continue;
                }

                let tx = await this.getTransaction(entries[i].tx_hash);
                mapping[entries[i].tx_hash] = tx;
                newList.push(tx);
                if(limit !== null && newList.length >= limit){
                    break;
                }
            }

            this.cache.setCache("addresstx." + address, newList);
            return newList;
        } else {
            return [];
        }

    }
}
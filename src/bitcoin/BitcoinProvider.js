'use strict';

import * as bitcoinjs from "bitcoinjs-lib";

const bitcoin = "default" in bitcoinjs ? bitcoinjs.default : bitcoinjs;

export class BitcoinProvider{
    cache;

    constructor(cache) {
        if (new.target === BitcoinProvider) {
            throw new TypeError("Cannot construct BitcoinProvider instances directly");
        }
        
        this.cache = cache;
    }

    async getRawTransaction(txid) {
        throw new Error("Not implemented");
    }

    async getTransactionBlockDetails(txid) {
        throw new Error("Not implemented");
    }

    async getAddressTransactions(address, limit = null) {
        throw new Error("Not implemented");
    }

    getAddressForInput(input) {
        if(input.address){
            return input.address;
        }
        if(input.witness){
            try{
                return input.address = bitcoin.payments.p2wpkh({input: input.script, witness: input.witness}).address;
            }catch (e) {}
            try{
                return input.address = bitcoin.payments.p2wsh({input: input.script, witness: input.witness}).address;
            }catch (e) {}
        }
        try{
            return input.address = bitcoin.payments.p2pkh({input: input.script}).address;
        }catch (e) {}
        try{
            return input.address = bitcoin.payments.p2sh(input.witness ? {redeem: bitcoin.payments.p2wpkh({witness: input.witness})} : {input: input.script}).address;
        }catch (e) {}
        try{
            return input.address = bitcoin.payments.p2pk({input: input.script}).address;
        }catch (e) {}
        try{
            return input.address = bitcoin.payments.p2ms({input: input.script}).address;
        }catch (e) {}

        return input.address = null;
    }

    getAddressForOutput(output) {
        if(output.address){
            return output.address;
        }
        return output.address = bitcoin.address.fromOutputScript(output.script);
    }

    getTransactionId(data){
        if(data instanceof bitcoin.Transaction){
            return data.getId();
        }else if("hash" in data && Buffer.isBuffer(data.hash)){
            return Buffer.from(data.hash).reverse().toString("hex");
        }else{
            throw new Error("Input data does not contain transaction id");
        }
    }

    async getPreviousOutput(input){
        if(input.prevOut){
            return input.prevOut;
        }
        return new Promise((async (resolve, reject) => {
            let out;
            try{
               out = (await this.getTransaction(this.getTransactionId(input))).outs[input.index];
            }catch (e) {
                reject(e);
                return;
            }

            resolve(input.prevOut = out);
        }));
    }

    async getTransaction(txid){
        if (txid.match(/^[0-9a-f]{64}$/i) === null) {
            throw new Error("Invalid transaction id " + txid)
        }

        let cache = this.cache.getCache("tx." + txid);
        if(cache !== null){
            return cache;
        }

        let tx;

        try{
            tx = bitcoin.Transaction.fromHex(await this.getRawTransaction(txid));
        }catch (e) {
            throw e;
        }

        this.cache.setCache("tx." + txid, tx);
        return tx;
    }



    async getAddressUnspentOutputs(address) {
        let txs = await this.getAddressTransactions(address);

        let outputs = {

        };

        //Add all outputs ever received
        for(let index in txs){
            let tx = txs[index];
            let txid = this.getTransactionId(tx);
            let bytehash = tx.getHash(false);
            for(let outputIndex in tx.outs){
                if(this.getAddressForOutput(tx.outs[outputIndex]) === address){
                    outputs[txid + ":" + outputIndex] = Object.assign({
                        hash: bytehash,
                        index: outputIndex
                    }, tx.outs[outputIndex]);
                }
            }
        }

        //Delete all used up
        for(let index in txs){
            let tx = txs[index];
            for(let j in tx.ins){
                delete outputs[this.getTransactionId(tx.ins[j]) + ":" + tx.ins[j].index]
            }
        }

        return outputs;
    }
}
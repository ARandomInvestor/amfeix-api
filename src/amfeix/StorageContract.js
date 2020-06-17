'use strict';

import Web3 from "web3";
import fs from "fs";
import path from "path";
import BigNumber from "bignumber.js";

import StorageABI from "./abi/Storage.js";

export class StorageContract{
    cache;

    constructor(web3, cache, btc = null, contractAddress = "0xb0963da9baef08711583252f5000Df44D4F56925") {
        this.web3 = web3;
        this.btc = btc;
        this.cache = cache;
        let ContractMeta = StorageABI;
        this.contract = new web3.eth.Contract(ContractMeta, contractAddress);
    }

    getProvider(){
        return this.web3;
    }

    getContract(){
        return this.contract;
    }

    getBitcoin(){
        return this.btc;
    }

    async getFundPerformance(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getFundPerformance");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let values = await this.contract.methods.getAll().call({});
            let index = [];

            let div = (new BigNumber(10)).exponentiatedBy(await this.getDecimals());

            for(let i in values.t){
                index.push({
                    time: values.t[i],
                    timestamp: new Date(values.t[i] * 1000),
                    value: new BigNumber(values.a[i]).dividedBy(div).toFormat(3)
                })
            }

            this.cache.setCache("getFundPerformance", index, 900);
            resolve(index);
        }));
    }

    //??????
    async getFee1(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getFee1");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let value = await this.contract.methods.fee1().call({});
            this.cache.setCache("getFee1", value, 900);

            resolve(value);
        }))
    }

    //Referrer fee
    async getFee2(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getFee2");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let value = await this.contract.methods.fee2().call({});
            this.cache.setCache("getFee2", value, 900);

            resolve(value);
        }))
    }

    //Full?
    async getFee3(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getFee3");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let value = await this.contract.methods.fee3().call({});
            this.cache.setCache("getFee3", value, 900);

            resolve(value);
        }))
    }


    async getAUM(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getAUM");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let value = (new BigNumber(await this.contract.methods.aum().call({}))).dividedBy(
                (new BigNumber(10)).exponentiatedBy(await this.getDecimals())
            ).toFormat(0);
            this.cache.setCache("getAUM", value);

            resolve(value);
        }))
    }


    async getDecimals(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("decimals");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let value = await this.contract.methods.decimals().call({});
            this.cache.setCache("decimals", value, 3600);

            resolve(value);
        }))
    }


    async getInvestors(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getInvestors");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let values = await this.contract.methods.getAllInvestors().call({});
            this.cache.setCache("getInvestors", values);

            resolve(values);
        }))
    }

    async getAllValues(count, getter, ...args){
        return new Promise((async (resolve, reject) => {
            let c = await count(...args);
            let list = [];
            for(let n = 0; n < c; ++n){
                list.push(await getter(...args, ...[n]));
            }
            resolve(list);
        }));
    }



    async getDepositAddressCount(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getDepositAddressCount");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let v = await this.contract.methods.fundDepositAddressesLength().call({});
            this.cache.setCache("getDepositAddressCount", parseInt(v));

            resolve(parseInt(v));
        }))
    }


    async getDepositAddress(n){
        return new Promise((async (resolve, reject) => {
            let cache = await this.cache.getFileCache("contract", "deposit_address_" + n);
            if(cache !== null){
                resolve(cache);
                return;
            }

            let v = await this.contract.methods.fundDepositAddresses(n).call({});
            await this.cache.setFileCache("contract", "deposit_address_" + n, v);

            resolve(v);
        }))
    }

    async getDepositAddresses(){
        return this.getAllValues(this.getDepositAddressCount.bind(this), this.getDepositAddress.bind(this));
    }


    async getFeeAddressCount(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getFeeAddressCount");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let v = await this.contract.methods.feeAddressesLength().call({});
            this.cache.setCache("getFeeAddressCount", parseInt(v));

            resolve(parseInt(v));
        }));
    }


    async getFeeAddress(n){
        return new Promise((async (resolve, reject) => {
            let cache = await this.cache.getFileCache("contract", "fee_address_" + n);
            if(cache !== null){
                resolve(cache);
                return;
            }

            let v = await this.contract.methods.feeAddresses(n).call({});
            await this.cache.setFileCache("contract", "fee_address_" + n, v);

            resolve(v);
        }));
    }

    async getFeeAddresses(){
        return this.getAllValues(this.getFeeAddressCount.bind(this), this.getFeeAddress.bind(this));
    }



    async getTxCount(address){
        return new Promise((async (resolve, reject) => {
            let v = await this.contract.methods.ntx(address).call({});
            resolve(parseInt(v));
        }))
    }


    async getTx(address, n){
        return new Promise((async (resolve, reject) => {
            let cache = await this.cache.getFileCache("contract_tx", address.slice(2).toLowerCase() + "_" + n);
            if(cache !== null){
                resolve(cache);
                return;
            }

            let v = await this.contract.methods.fundTx(address, n).call({});
            let data = {
                txid: v.txId,
                pubkey: v.pubKey,
                signature: v.signature,
                action: parseInt(v.action),
                time: v.timestamp,
                timestamp: new Date(v.timestamp * 1000)
            };

            await this.cache.setFileCache("contract_tx", address.slice(2).toLowerCase() + "_" + n, data);

            resolve(data);
        }))
    }

    async getTxs(address){
        return this.getAllValues(this.getTxCount.bind(this), this.getTx.bind(this), address);
    }

    async getWithdrawRequestCount(address){
        return new Promise((async (resolve, reject) => {
            resolve(parseInt(await this.contract.methods.rtx(address).call({})));
        }));
    }


    async getWithdrawRequest(address, n){
        return new Promise((async (resolve, reject) => {
            let cache = await this.cache.getFileCache("contract_rtx", address.slice(2).toLowerCase() + "_" + n);
            if(cache !== null){

                resolve(cache);
                return;
            }

            let v = await this.contract.methods.reqWD(address, n).call({});
            let data = {
                txid: v.txId,
                pubkey: v.pubKey,
                signature: v.signature,
                action: parseInt(v.action),
                time: v.timestamp,
                timestamp: new Date(v.timestamp * 1000),
                referal: v.referal
            };

            await this.cache.setFileCache("contract_rtx", address.slice(2).toLowerCase() + "_" + n, data);

            resolve(data);
        }));
    }

    async getWithdrawRequests(address){
       return this.getAllValues(this.getWithdrawRequestCount.bind(this), this.getWithdrawRequest.bind(this), address);
    }

}
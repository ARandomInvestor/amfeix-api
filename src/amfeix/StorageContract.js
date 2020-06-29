'use strict';

import BigNumber from "bignumber.js";

import StorageABI from "./abi/Storage.js";

import { WithdrawalConfirmationRecord } from "./WithdrawalConfirmationRecord.js";

export class StorageContract{
    cache;

    constructor(web3, cache, btc = null, contractAddress = "0xb0963da9baef08711583252f5000Df44D4F56925") {
        this.web3 = web3;
        this.btc = btc;
        this.cache = cache;
        let ContractMeta = StorageABI;
        this.contract = new web3.eth.Contract(ContractMeta, contractAddress);
        this.extraWithdrawalFeeEnabled = 1591055000;
        this.extraVerificationEnabled = 1592915984;
    }

    getSpecialStorageAddress(){
        return "0x0000000000000000000000000000000000000000";
    }

    getExtraWithdrawalFee(){
        return this.extraWithdrawalFeeEnabled;
    }

    getExtraRequestVerification(){
        return this.extraVerificationEnabled;
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

    async getAccountIndex(account){
        let investors = await this.cache.getFileCache("contract", "getInvestorsCache");
        if(investors === null){
            investors = (await this.getInvestors()).map((v) => {return v.toLowerCase();});
            await this.cache.setFileCache("contract", "getInvestorsCache", investors);
        }

        let accountIndex = investors.indexOf(account.getEthereumAddress().toLowerCase());

        if(accountIndex === -1){ //Retry if local file cache is stale
            investors = (await this.getInvestors()).map((v) => {return v.toLowerCase();});
            await this.cache.setFileCache("contract", "getInvestorsCache", investors);
            accountIndex = investors.indexOf(account.getEthereumAddress().toLowerCase());
        }
        return accountIndex === -1 ? null : accountIndex;
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
                    value: new BigNumber(values.a[i]).dividedBy(div).toFixed(3)
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

    async getOwner(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getOwner");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let value = await this.contract.methods.owner().call({});
            this.cache.setCache("getOwner", value, 900);

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
            ).toFixed(0);
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

            let values = null;

            let maxTries = 5;
            let lastException = null;

            for(let i = 0; i < maxTries; ++i){
                try{
                    values = await this.contract.methods.getAllInvestors().call({});
                    break;
                }catch (e) {
                    lastException = e;
                }
            }

            if(values === null){
                reject(lastException ? lastException : new Error("max tries reached"));
                return;
            }

            this.cache.setCache("getInvestors", values, 3600);

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
            if(address === this.getSpecialStorageAddress()){
                let cache = this.cache.getCache("getTxCount_specialStorageAddress");
                if(cache !== null){
                    resolve(cache);
                    return;
                }
            }

            let v = await this.contract.methods.ntx(address).call({});

            if(address === this.getSpecialStorageAddress()){
                this.cache.setCache("getTxCount_specialStorageAddress", parseInt(v), 3600);
            }

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

    async getWithdrawalConfirmationRecords(){
        return new Promise((async (resolve, reject) => {
            let cache = this.cache.getCache("getWithdrawalConfirmationRecords");
            if(cache !== null){
                resolve(cache);
                return;
            }

            let txs = await this.getTxs(this.getSpecialStorageAddress());
            let records = [];
            for(let i in txs){
                let tx = txs[i];
                try{
                    if(tx.action == 1){
                        let record = WithdrawalConfirmationRecord.fromSerializedReturnInvestmentData({
                            method: "returnInvestment",
                            parameters: [
                                {
                                    name: "address",
                                    value: this.getSpecialStorageAddress()
                                },
                                {
                                    name: "txid",
                                    value: tx.txid
                                },
                                {
                                    name: "pubkey",
                                    value: tx.pubkey,
                                },
                                {
                                    name: "signature",
                                    value: tx.signature,
                                },
                            ],
                        }, this);

                        records.push(record);
                    }
                }catch (e) {

                }
            }

            this.cache.setCache("getWithdrawalConfirmationRecords", records);
            resolve(records);
        }));

    }

}
'use strict';

import Web3 from "web3";
import ethereum_wallet from "ethereumjs-wallet";

import BigNumber from "bignumber.js";
import * as bitcoinjs from "bitcoinjs-lib";
import * as bitcoinjsMessage from "bitcoinjs-message"

const bitcoin = "default" in bitcoinjs ? bitcoinjs.default : bitcoinjs;
const bitcoinMessage = "default" in bitcoinjsMessage ? bitcoinjsMessage.default : bitcoinjsMessage;

export class InvestorAccount{

     static async fromEthereumAddress(address, contract) {
         return new Promise((async (resolve, reject) => {
             if(address.toLowerCase() === contract.getSpecialStorageAddress()){
                 reject(new Error("Tried to create account for special storage address"))
                 return;
             }
             let txCount = await contract.getTxCount(address);
             let account = null;
             for(let i = 0; i < txCount; ++i){
                 try{
                     let tx = await contract.getTx(address, i);
                     let pub = tx.pubkey.split("/").pop();
                     account = new InvestorAccount(pub, contract)
                     if(account.getEthereumAddress().toLowerCase() !== address.toLowerCase()){
                         account = null;
                         throw new Error("Not matching pubkey" + pub);
                     }
                     break;
                 }catch (e) {
                     console.log("Account " + address + ": " + e)
                 }
             }
             if(account){
                 resolve(account)
             }else {
                 reject(new Error("Could not find valid transactions for account " + address))
             }

         }));
    }

    constructor(pubkey, contract) {
        this.pubkey = pubkey;
        let bpub = Buffer.from(pubkey, "hex");
        this.eth_address = ethereum_wallet.fromPublicKey(bpub, true).getChecksumAddressString();
        this.btc_address = bitcoin.payments.p2pkh({
            pubkey: bpub,
        }).address;
        this.contract = contract;
    }

    getEthereumAddress(){
        return this.eth_address;
    }

    getBitcoinAddress(){
        return this.btc_address;
    }

    getPublicKey(){
        return this.pubkey;
    }

    async getAccountIndex(){
         return await this.contract.getAccountIndex(this);
    }

    async getTransactions(){
        return new Promise((async (resolve, reject) => {
            let values = await this.contract.getTxs(this.eth_address);
            let txs = {};
            for(let i in values){
                let v = values[i];
                v.pubkey = v.pubkey.split("/").pop();
                v.txid = v.txid.split("/").pop();
                v.index = parseInt(i);
                if(v.action === 0){
                    if(txs.hasOwnProperty(v.txid)){
                        if(!txs[v.txid].hasOwnProperty("dupe")){
                            txs[v.txid].dupe = [];
                        }
                        txs[v.txid].dupe.push(v);
                    }else{
                        txs[v.txid] = v;
                        txs[v.txid].exit_timestamp = null;
                        txs[v.txid].exit_record = null;
                    }
                }else if (v.action === 1 && v.txid in txs){
                    txs[v.txid].exit_timestamp = v.time;
                }

            }

            try{
                let accountIndex = await this.getAccountIndex();
                if(accountIndex !== null){
                    let extraRecords = await this.contract.getWithdrawalConfirmationRecords();

                    for(let k in extraRecords){
                        let records = extraRecords[k].getAccountRecords(accountIndex);
                        for(let r in records){
                            let re = records[r];
                            let tx = Object.values(txs).find((tx) => {
                                return tx.index === re.index
                            });
                            if(tx === undefined){
                                throw new Error("Could not find index " + re.index + " on deposits");
                            }

                            tx.exit_timestamp = extraRecords[k].getTime();
                            tx.exit_record = extraRecords[k];
                        }
                    }
                }
            }catch (e) {
                console.log(this.eth_address, e.message);
            }


            let requests = await this.contract.getWithdrawRequests(this.eth_address);
            for(let j in requests){
                let rtx = requests[j];
                rtx.pubkey = rtx.pubkey.split("/").pop();
                rtx.txid = rtx.txid.split("/").pop();
                rtx.index = j;
                if(txs.hasOwnProperty(rtx.txid)){
                    let signatureVerificationResult = this.contract.getExtraRequestVerification() === null || rtx.time <= this.contract.getExtraRequestVerification();
                    if(!signatureVerificationResult){
                        try{
                            signatureVerificationResult = bitcoinMessage.verify(rtx.txid + ":" + rtx.pubkey, this.getBitcoinAddress(), rtx.signature)
                        }catch (e) {
                            console.log("WARNING: invalid extra verification for " + this.eth_address);
                            console.log(e)
                        }
                    }

                    if(txs[rtx.txid].hasOwnProperty("requested_exit") || rtx.pubkey !== txs[rtx.txid].pubkey || !signatureVerificationResult/* || rtx.signature !== txs[rtx.txid].signature*/){
                        if(!txs[rtx.txid].hasOwnProperty("invalid_rtx")){
                            txs[rtx.txid].invalid_rtx = [];
                        }
                        txs[rtx.txid].invalid_rtx.push(rtx);
                    }else{
                        txs[rtx.txid].requested_exit = rtx.time;
                        txs[rtx.txid].rtx = rtx;
                    }
                }else{
                    console.log("WARNING: found unmatched rtx for " + this.eth_address);
                    console.log(rtx);
                }
            }

            resolve(txs);
        }));
    }

    async getTransactionsWithInterest(index){
        return new Promise((async (resolve, reject) => {
            let txs = await this.getTransactions();
            for(let txid in txs){
                let tx = txs[txid];
                let compoundedValue = new BigNumber(1);
                tx.last_interest = null;

                for(let i = 0; i < index.length; ++i){
                    let entry = index[i];

                    if(tx.exit_timestamp !== null && entry.time > tx.exit_timestamp){
                        break;
                    }

                    if(entry.time < tx.time){
                        continue;
                    }

                    tx.last_interest = entry.time;

                    let performanceValue = new BigNumber(entry.value);

                    compoundedValue = compoundedValue.multipliedBy((new BigNumber(1)).plus(performanceValue.dividedBy(100)));
                }

                tx.interest = compoundedValue;
            }

            resolve(txs);
        }))
    }

    async getBalance(){
        return new Promise(async (resolve, reject) => {
            if(this.contract.getBitcoin() === null){
                reject("this.contract.getBitcoin() === null");
                return;
            }

            let depositAddresses = await this.contract.getDepositAddresses();
            let index = await this.contract.getFundPerformance();
            let fee2 = new BigNumber(await this.contract.getFee2());
            let transactions = await this.getTransactionsWithInterest(index);
            let currentValue = new BigNumber(0);
            let currentCompounded = new BigNumber(0);
            let totalValue = new BigNumber(0);
            let totalCompounded = new BigNumber(0);
            let firstInvestment = null;
            let lastInvestment = [null, 0];

            for(let txid in transactions){
                let tx = transactions[txid];
                let txdata = null;
                try{
                    txdata = await this.contract.getBitcoin().getTransaction(tx.txid);
                }catch (e) {
                    console.log(e)
                    console.trace()
                    delete transactions[txid];
                    continue;
                }

                for(let i in txdata.outs){
                    if(depositAddresses.includes(await this.contract.getBitcoin().getAddressForOutput(txdata.outs[i]))){
                        if("value" in tx && !(new BigNumber(txdata.outs[i].value)).isEqualTo(tx.value) && tx.value.isGreaterThan(0)){
                            console.log("Have more than one output with value for txid " + tx.txid);
                            continue;
                        }
                        tx.value = new BigNumber(txdata.outs[i].value);
                    }
                }

                if(!tx.hasOwnProperty("value")){
                    reject("Could not find transaction value for txid " + tx.txid);
                    return;
                }

                if(tx.time < firstInvestment || firstInvestment === null){
                    firstInvestment = tx.time;
                }

                if((lastInvestment[0] === null || lastInvestment[1] !== 0) && tx.exit_timestamp !== null && tx.exit_timestamp > lastInvestment[1]){
                    lastInvestment = [tx, tx.exit_timestamp];
                }else if(tx.exit_timestamp === null && (lastInvestment[0] === null || lastInvestment[0].time < tx.time)){
                    lastInvestment = [tx, 0];
                }

                if(tx.signature === "referer"){
                    let compoundedValue = tx.interest.multipliedBy(tx.value).minus(tx.value).multipliedBy(fee2.dividedBy(10));
                    if(compoundedValue.isLessThan(0)){
                        //TODO: AMFEIX BUG If overall result is negative, value is positive instead???
                        compoundedValue = compoundedValue.multipliedBy(-1);
                    }

                    totalCompounded =  totalCompounded.plus(compoundedValue);
                    tx.balance = compoundedValue;
                    if(tx.exit_timestamp === null){
                        currentCompounded = currentCompounded.plus(compoundedValue);
                    }
                    tx.referral_value = tx.value;
                    tx.value = new BigNumber(0);
                }else{
                    let compoundedValue = tx.interest.multipliedBy(tx.value);

                    totalCompounded = totalCompounded.plus(compoundedValue);
                    totalValue = totalValue.plus(tx.value);
                    tx.balance = compoundedValue;

                    if(tx.exit_timestamp === null){
                        currentCompounded = currentCompounded.plus(compoundedValue);
                        currentValue = currentValue.plus(tx.value);
                    }
                }

                if(tx.hasOwnProperty("requested_exit") && this.contract.getExtraWithdrawalFeeTime() !== null && tx.requested_exit >= this.contract.getExtraWithdrawalFeeTime()){
                    let wdFee = this.contract.getExtraWithdrawalFee();
                    tx.withdrawalFee = tx.balance.multipliedBy(wdFee);
                    tx.balance = tx.balance.multipliedBy(1.0 - wdFee);
                }

            }

            let relatedIndex = [];
            for(let i = 0; i < index.length; ++i){
                let entry = index[i];
                if(entry.time < firstInvestment){
                    continue;
                }

                if(lastInvestment[1] !== 0 && entry.time > lastInvestment[1]){
                    break;
                }

                relatedIndex.push(entry);
            }

            resolve({
                current: {
                    initial: currentValue,
                    balance: currentCompounded,
                    growth: currentCompounded.minus(currentValue),
                    yield: currentValue.isEqualTo(0) ? new BigNumber(0) : currentCompounded.minus(currentValue).dividedBy(currentValue)
                },
                total: {
                    initial: totalValue,
                    balance: totalCompounded,
                    growth: totalCompounded.minus(totalValue),
                    yield: totalValue.isEqualTo(0) ? new BigNumber(0) : totalCompounded.minus(totalValue).dividedBy(totalValue)
                },
                transactions: transactions,
                index: relatedIndex
            });

        });

    }




    async getEthereumBalance(){
        return new Promise((async (resolve, reject) => {
            resolve(await this.contract.getProvider().eth.getBalance(this.eth_address, "latest"));
        }))
    }

    async getBitcoinMatchingTransactions(balance){
         return new Promise(async (resolve, reject) => {
             try{
                 let btc = this.contract.getBitcoin();
                 let transactions = balance.transactions;
                 let txs = await btc.getAddressTransactions(this.btc_address);
                 let matchingTransactions = [];
                 for(let i in txs){
                     let tx = txs[i];
                     let txid = btc.getTransactionId(tx);
                     let txtrack = {
                         txid: txid,
                         track_txid: []
                     };

                     for(let j in transactions){
                         let btx = transactions[j];
                         if(txid === btx.txid){
                             txtrack.track_type = "deposit";
                             txtrack.track_txid = [btx.txid];
                             break;
                         }
                     }



                     if(!txtrack.hasOwnProperty("track_type")){
                         let values = [];

                         for(let j in tx.outs){
                             if(btc.getAddressForOutput(tx.outs[j]) === this.btc_address){
                                 values.push(new BigNumber(tx.outs[j].value));
                             }
                         }

                         for(let j in tx.ins){
                             if(btc.getAddressForInput(tx.ins[j]) === this.btc_address){
                                 values = [];
                                 break;
                             }
                         }


                         for(let j in transactions){
                             let btx = transactions[j];
                             if(btx.exit_timestamp !== null){
                                 let timeDiff = Math.abs(btx.exit_timestamp - (await btc.getTransactionBlockDetails(txid)).time);

                                 if(timeDiff < (3600 * 4)){
                                     for(let k in values){
                                         let v = values[k];
                                         let valueDiff = btx.balance.minus(v).absoluteValue();
                                         if(valueDiff.isLessThan(100)){
                                             //Precise match
                                             txtrack.track_type = "withdrawal";
                                             txtrack.track_txid.push(btx.txid);
                                             break;
                                         }
                                     }

                                     if(!txtrack.track_txid.includes(btx.txid)){
                                         let delta = 0.005;
                                         for(let k in values){
                                             let v = values[k];
                                             let valueDiff = btx.balance.minus(v).absoluteValue();
                                             if(valueDiff.isLessThan(btx.balance.multipliedBy(delta))){
                                                 //Non-precise match
                                                 txtrack.track_type = "withdrawal";
                                                 txtrack.track_txid.push(btx.txid);
                                                 break;
                                             }
                                         }
                                     }
                                 }
                             }
                         }

                         if(!txtrack.hasOwnProperty("track_type")){
                             for(let j in transactions){
                                 let btx = transactions[j];
                                 if(btx.exit_timestamp !== null){
                                     let timeDiff = Math.abs(btx.exit_timestamp - (await btc.getTransactionBlockDetails(txid)).time);

                                     if(timeDiff < (3600 * 24)){
                                         let delta = 0.05;
                                         for(let k in values){
                                             let v = values[k];
                                             let valueDiff = btx.balance.minus(v).absoluteValue();
                                             if(valueDiff.isLessThan(btx.balance.multipliedBy(delta))){
                                                 //VERY Non-precise match
                                                 txtrack.track_type = "withdrawal";
                                                 txtrack.track_txid.push(btx.txid);
                                                 break;
                                             }
                                         }

                                         if(!txtrack.track_txid.includes(btx.txid)){
                                             for(let k in values){
                                                 let v = values[k];
                                                 let valueDiff = btx.balance.minus(v).absoluteValue();
                                                 if(valueDiff.isLessThan(80000)){
                                                     //Precise match
                                                     txtrack.track_type = "withdrawal";
                                                     txtrack.track_txid.push(btx.txid);
                                                     break;
                                                 }
                                             }
                                         }
                                     }
                                 }
                             }
                         }
                     }

                     if(txtrack.hasOwnProperty("track_type")){
                         matchingTransactions.push(txtrack);
                     }
                 }

                 resolve(matchingTransactions)
             }catch (e) {
                 console.log(e)
                 resolve([])
             }

         });

    }

    async getBitcoinUnspentOutputs(){
        if(this.contract.getBitcoin() === null){
            throw new Error("this.contract.getBitcoin() === null");
        }
        return this.contract.getBitcoin().getAddressUnspentOutputs(this.btc_address);
    }

    async getBitcoinBalance(){
        return new Promise((async (resolve, reject) => {
            if(this.contract.getBitcoin() === null){
                throw new Error("this.contract.getBitcoin() === null");
            }

            let outputs = await this.getBitcoinUnspentOutputs();



            let currentValue = new BigNumber(0);
            for(let i in outputs){
                currentValue = currentValue.plus(outputs[i].value);
            }

            resolve(currentValue, outputs);
        }));

    }
}
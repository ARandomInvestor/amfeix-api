'use strict';

import BigNumber from "bignumber.js";

import { BitcoinUnitConverter } from "../bitcoin/BitcoinUnitConverter.js";

import pako from "pako"

export class WithdrawalConfirmationRecord{
    entries = {};
    version = 1;
    finalized = false;
    txid = null;
    time = null;

    constructor(contract) {
        this.contract = contract;
        this.time = Math.floor(Date.now() / 1000);
    }

    finalize(){
        this.finalized = true;
    }

    setTime(time){
        if(this.finalized){
            throw new Error("Record is finalized");
        }
        this.time = time;
    }

    getTime(){
        if(!this.finalized){
            throw new Error("Record is not finalized");
        }
        return this.time;
    }

    setTransactionId(txid){
        if(this.finalized){
            throw new Error("Record is finalized");
        }
        this.txid = txid;
    }

    getTransactionId(){
        if(!this.finalized){
            throw new Error("Record is not finalized");
        }
        return this.txid;
    }



    addPaymentEntry(accountIndex, depositIndex, amount, withdrawalAddress, isStandardWithdrawalAddress = true){
        if(this.finalized){
            throw new Error("Record is finalized");
        }

        if(!(accountIndex in this.entries)){
            this.entries[accountIndex] = [];
        }

        let depositExists = this.entries[accountIndex].filter((v) => {
            return v.index === depositIndex;
        })

        if(depositExists.length > 0){
            throw new Error("Index " + depositIndex + " already exists for account " + accountIndex);
        }

        this.entries[accountIndex].push({
            index: depositIndex,
            amount: amount,
            withdrawalAddress: withdrawalAddress,
            isStandardWithdrawalAddress: isStandardWithdrawalAddress
        })
    }

    getJoinedPayToMany(){
        if(!this.finalized){
            throw new Error("Record is not finalized");
        }

        let totals = {};

        for(let i in this.entries){
            for(let j in this.entries[i]){
                let e = this.entries[i][j];

                if(e.withdrawalAddress === null){
                    throw new Error("Incomplete parsed record");
                }

                if(!(e.withdrawalAddress in totals)){
                    totals[e.withdrawalAddress] = new BigNumber(0);
                }

                totals[e.withdrawalAddress] = totals[e.withdrawalAddress].plus(e.amount);
            }
        }

        let ptm = "";

        for(let addr in totals){
            ptm += addr + ", " + BitcoinUnitConverter.from_Satoshi(totals[addr]).to_BTC().toFixed(BitcoinUnitConverter.getDecimalPlaces()) + "\n";
        }

        return ptm;
    }

    getSplitPayToMany(){
        if(!this.finalized){
            throw new Error("Record is not finalized");
        }

        let ptm = "";

        for(let i in this.entries){
            for(let j in this.entries[i]){
                let e = this.entries[i][j];
                if(e.withdrawalAddress === null){
                    throw new Error("Incomplete parsed record");
                }
                ptm += e.withdrawalAddress + ", " + BitcoinUnitConverter.from_Satoshi(e.amount).to_BTC().toFixed(BitcoinUnitConverter.getDecimalPlaces()) + "\n"
            }
        }

        return ptm;
    }

    getSerializedCompressedEntries(){
        let compressed = "";

        let radix = 36;

        for(let accountIndex in this.entries){

            let myEntry = this.entries[accountIndex].map((v) => {
                //TODO: change this first index to transaction output, once ready?
                let x = parseInt(v.index).toString(radix) + "," + parseInt(BitcoinUnitConverter.from_Satoshi(v.amount).to_Satoshi().toFixed(0)).toString(radix);
                if(!v.isStandardWithdrawalAddress){
                    x += "," + v.withdrawalAddress;
                }
                return x;
            }).join(";");

            compressed += parseInt(accountIndex).toString(radix) + ":" + myEntry + "|";
        }

        return compressed;
    }

    getAccountRecords(accountIndex){
        return accountIndex in this.entries ? this.entries[accountIndex] : [];
    }

    static fromSerializedCompressedEntries(compressed){

        let radix = 36;

        let entries = {};

        compressed.split("|").map((e) => {
            if(e.trim() === ""){
                return;
            }
            let [accountIndex, data] = e.split(":");
            entries[parseInt(accountIndex, radix)] = data.split(";").map((v) => {
                let values = v.split(",");
                return {
                    index: parseInt(values[0], radix),
                    amount: new BigNumber(parseInt(values[1], radix)),
                    withdrawalAddress: values.length > 2 ? values[2] : null,
                    isStandardWithdrawalAddress: values.length <= 2
                };
            });
        });

        return entries;
    }

    static fromSerializedReturnInvestmentData(ob, contract){
        try{
            if(ob.method === "returnInvestment"){
                let signature = JSON.parse(ob.parameters[3].value);
                if(signature.version === 1){

                    let rec = signature.compressed ? pako.inflate(atob(ob.parameters[2].value), {to: 'string'}) : ob.parameters[2].value;

                    let entries = WithdrawalConfirmationRecord.fromSerializedCompressedEntries(rec);


                    let record = new WithdrawalConfirmationRecord(contract);

                    for(let accountIndex in entries){
                        for(let i in entries[accountIndex]){
                            let rs = entries[accountIndex][i];
                            record.addPaymentEntry(accountIndex, rs.index, rs.amount, rs.withdrawalAddress, rs.isStandardWithdrawalAddress);
                        }
                    }

                    record.setTransactionId(ob.parameters[1].value);
                    record.setTime(signature.time);
                    record.finalize();

                    return record;
                }
            }
        }catch (e) {
            console.log("Invalid record: " + e.message);
            throw e;
        }

        throw new Error("Invalid record");
    }

    getSerializedReturnInvestmentData(){
        return {
            method: "returnInvestment",
            parameters: [
                {
                    name: "address",
                    value: this.contract.getSpecialStorageAddress()
                },
                {
                    name: "txid",
                    value: this.txid
                },
                {
                    name: "pubkey",
                    value: btoa(pako.deflate(this.getSerializedCompressedEntries(), {to: 'string', level: 7}))
                },
                {
                    name: "signature",
                    value: JSON.stringify({
                        method: "returnInvestment",
                        version: this.version,
                        time: this.time,
                        compressed: true,
                        keys: ["+index", "+amount", "?to"]
                    }),
                },
            ],
        }
    }


}
'use strict';

import BigNumber from "bignumber.js";

const units = {
    btc: new BigNumber("100000000"),
    mbtc: new BigNumber("100000"),
    satoshi: new BigNumber("1"),
    msat: (new BigNumber("1")).dividedBy(1000),
};

export class BitcoinUnitConverter{
    satoshi = new BigNumber(0);

    constructor(satoshi) {
        this.satoshi = (satoshi instanceof BigNumber) ? new BigNumber(satoshi) : new BigNumber(satoshi);
    }

    static from_Satoshi(satoshi){
        return new BitcoinUnitConverter(satoshi);
    }

    static from_BTC(btc){
        return new BitcoinUnitConverter((btc instanceof BigNumber ? btc : new BigNumber(btc)).multipliedBy(units.btc));
    }

    static from_mBTC(mbtc){
        return new BitcoinUnitConverter((mbtc instanceof BigNumber ? mbtc : new BigNumber(mbtc)).multipliedBy(units.mbtc));
    }

    static from_mSat(msat){
        return new BitcoinUnitConverter((msat instanceof BigNumber ? msat : new BigNumber(msat)).multipliedBy(units.msat));
    }

    static getDecimalPlaces(){
        return 8;
    }

    to_Satoshi(){
        return new BigNumber(this.satoshi);
    }

    to_BTC(){
        return this.satoshi.dividedBy(units.btc);
    }

    to_mBTC(){
        return this.satoshi.dividedBy(units.mbtc);
    }

    to_mSat(){
        return this.satoshi.dividedBy(units.msat);
    }
}
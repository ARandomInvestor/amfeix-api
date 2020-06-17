'use strict';

import {BigNumber} from "bignumber.js";

const units = {
    eth: new BigNumber("1000000000000000000"),
    gwei: new BigNumber("1000000000"),
    wei: new BigNumber("1")
};

export class EthereumUnitConverter{
    constructor(wei) {
        this.wei = wei instanceof BigNumber ? new BigNumber(wei) : new BigNumber(wei);
    }

    static from_Wei(wei){
        return new EthereumUnitConverter(wei);
    }

    static from_ETH(eth){
        return new EthereumUnitConverter((eth instanceof BigNumber ? eth : new BigNumber(eth)).multipliedBy(units.eth));
    }

    static from_Gwei(gwei){
        return new EthereumUnitConverter((gwei instanceof BigNumber ? gwei : new BigNumber(gwei)).multipliedBy(units.gwei));
    }

    static getDecimalPlaces(){
        return 18;
    }

    to_Wei(){
        return new BigNumber(this.wei);
    }

    to_ETH(){
        return this.wei.dividedBy(units.eth);
    }

    to_Gwei(){
        return this.wei.dividedBy(units.gwei);
    }
}
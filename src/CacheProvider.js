"use strict";

import fs from "fs";
import path from "path";

export class CacheProvider{
    cache = {};
    path;

    constructor(path = "./") {
        this.path = path;
    }

    clearCache(){
        this.cache = {};
    }

    getCache(k){
        return (k in this.cache && this.cache[k][1] >= Date.now()) ? this.cache[k][0] : null;
    }

    setCache(k, v, age = 60){
        if(v === null){
            delete this.cache[k];
            return;
        }
        this.cache[k] = [v, Date.now() * age * 1000];
    }

    async getFileCache(type, k, i = 0){
        let cache = this.getCache(type + "." + k);
        if(cache === null){
            try{
                let result = fs.readFileSync(path.resolve(this.path, "index", type, k[i], k + ".json"))
                cache = JSON.parse(result);
                if(cache !== null){
                    this.setCache(type + "." + k, cache, 3600);
                }
            }catch (e) {
                return null;
            }
        }

        return cache;
    }

    async setFileCache(type, k, v, i = 0){
        new Promise(((resolve, reject) => {
            this.setCache(type + "." + k, v, 3600);
            fs.writeFile(path.resolve(this.path, "index", type, k[i], k + ".json"), JSON.stringify(v, null, " "), (err) => {
                if(err){
                    reject(err)
                }else{
                    resolve();
                }
            });
        }))
    }
}
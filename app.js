import fs from 'fs';
import bencode from 'bencode';
import { type } from 'os';


fs.readFile('file.torrent',(err,data) => {
    if(err){
        throw err
    }
    const convertUint8ArrayToString = (obj) => {
        if (obj instanceof Uint8Array) {
            return new TextDecoder().decode(obj);
        } else if (Array.isArray(obj)) {
            return obj.map(convertUint8ArrayToString);
        } else if (typeof obj === 'object' && obj !== null) {
            return Object.fromEntries(
                Object.entries(obj).map(([key, value]) => [key, convertUint8ArrayToString(value)])
            );
        }
        return obj;
    };
    let jsonData = bencode.decode(data)
    console.log(convertUint8ArrayToString(jsonData))
})
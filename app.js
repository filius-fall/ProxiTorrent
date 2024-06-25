import fs from 'fs/promises';
import bencode from 'bencode';
import { type } from 'os';
import crypto from 'crypto';
import net from 'net';
import { URLSearchParams } from 'url';
import axios from 'axios';

import dgram from 'dgram'

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
const ProccessedTorrentFile = async () => {
    let data = await fs.readFile('file.torrent')
    let jsonData = bencode.decode(data)
    let parsedTorrent = convertUint8ArrayToString(jsonData)

    
    return parsedTorrent

}

const peerId = () => {
    const clientPrefix = '-FCV1000-'
    const randomBytes = crypto.randomBytes(10).toString('hex')
    return clientPrefix + randomBytes
}

const torrentInfo = async () => {
    const parsedTorrent = await ProccessedTorrentFile()
    const infoDict = parsedTorrent.info
    const bencodedData = bencode.encode(infoDict)
    const infoHash = crypto.createHash('sha1').update(bencodedData).digest('hex')
    const infoHashURLEncoded = encodeURIComponent(infoHash.toString('binary'))
    let pId = peerId()
    const port = 6881

    const announceURL = parsedTorrent.announce

    let response = {
        'annouceUrl':announceURL,
        'info_hash':infoHashURLEncoded,
        'peer_id':pId,
        'port':port,
        'uploaded':0,
        'downloaded':0,
        'left':parsedTorrent.info.length,
        'event':'started'
    }

    return response
}


let info = torrentInfo()

const createUDPport = async () => {
    let res = await torrentInfo()

    let hostURL = res.annouceUrl
    let port = res.port

    // 0000041727101980 is a standard connection ID of UDP protocol for BitTorrent connection
    const connectionID = Buffer.from('0000041727101980','hex')
    const action = Buffer.alloc(4)  // This create 32 bit or 4 Bytes buffer for action
    action.writeUInt32BE(0,0)  // writeUInt32BE(data,offset) data = data to be added, offset= by what offset data to be added

    const transactionID = crypto.randomBytes(4)

    const connectionInfo = Buffet.concat([connectionID,action,transactionID])

    return connectionInfo
}

const socket = dgram.createSocket('udp4')

console.log(info)

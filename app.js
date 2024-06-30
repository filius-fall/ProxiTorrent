import fs from 'fs/promises';
import bencode from 'bencode';
import { type } from 'os';
import crypto from 'crypto';
import net from 'net';
import { URLSearchParams } from 'url';
import axios from 'axios';

import dgram from 'dgram'


import EventEmitter from 'events';

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
    let data = await fs.readFile('first_file.torrent')
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
    const infoHashURLEncoded = encodeURIComponent(infoHash)
    let pId = peerId()
    const port = 6881

    const annouceUrls = parsedTorrent['announce-list'].flat()

    const announceURL = parsedTorrent.announce

    let response = {
        'annouceUrl':announceURL,
        'info_hash':infoHashURLEncoded,
        'peer_id':pId,
        'port':port,
        'uploaded':0,
        'downloaded':0,
        'left':parsedTorrent.info.length,
        'event':'started',
        'announceUrls':annouceUrls
    }

    return response
}



const createUDPport = async () => {
    let res = await torrentInfo()

    let hostURL = res.annouceUrl
    let port = res.port


    return connectionInfo
}

const createConnectionRequest = (transactionID) => {

    // 0000041727101980 is a standard connection ID of UDP protocol for BitTorrent connection
    const connectionID = Buffer.from('0000041727101980','hex')
    const action = Buffer.alloc(4)  // This create 32 bit or 4 Bytes buffer for action
    action.writeUInt32BE(0,0)  // writeUInt32BE(data,offset) data = data to be added, offset= by what offset data to be added


    return Buffer.concat([connectionID,action,transactionID])
}

const PendingConnectionsRequests = {}

class TrackerData extends EventEmitter{
    constructor(){
        super()
        this.tracker = new Proxy({},this.createHandler())
    }

    createHandler(){
        return {
            set:(target,key,value) => {
                let isTargetExists = !target.hasOwnProperty(key)
                if(isTargetExists){
                    target[key] = value
                    this.emit('trackerAdded',key,value)
                }
                return true
            }
        }
    }

    addTracker(key,value) {
        this.tracker[key] = value
    }

    getTracker(){
        return this.tracker
    }

}

const ConnectedTrackersList = new TrackerData()




const socket = dgram.createSocket('udp4')

const sendConnectionRequest = (trackerURL, port, retryCount = 0) => {

    const transactionID = crypto.randomBytes(4)
    const connectionRequest = createConnectionRequest(transactionID)

    socket.send(connectionRequest, 0, connectionRequest.length, port, trackerURL.hostname, (err) => {
        if (err) {
            if (err.code === 'ENOTFOUND' && retryCount <= 15) {
                setTimeout(() => sendConnectionRequest(trackerURL, port, retryCount + 1), 1000);
            } else {
                console.error("Sending error:", err);
            }
        } else {
            console.log("Connection request sent to", trackerURL.hostname, "on port", port);
            PendingConnectionsRequests[transactionID.toString('hex')] = trackerURL
        }
    });

const createAnnouceRequest = (connectionID, transactionID, infoHash, peerId, left) => {
    let action = Buffer.alloc(4)
    action.writeUInt32BE(1,0)
    
    const Download = Buffer.alloc(8)
    Download.writeBigInt64BE(On,0)

    const leftBuffer = Buffer.alloc(8)
    leftBuffer.writeBigInt64BE(BigInt(left),0)

    const Uploaded = Buffer.alloc(8)
    Uploaded.writeBigInt64BE(0,0)

    const ip = Buffer.alloc(4)
    ip.writeUInt32BE(0,0)

    const event = Buffer.alloc(4)
    event.writeUInt32BE(0,0)

    const wantedPeers = Buffer.alloc(4)
    wantedPeers.writeInt32BE(-1,0)

    const key = crypto.randomBytes(4)

    return Buffer.concat([
        connectionID,
        action,
        transactionID,
        Buffer.from(infoHash,'hex'),
        Buffer.from(peerId),
        Download,
        Uploaded,
        event,
        ip,
        key,
        wantedPeers

    ])
}

socket.on('message', (response) => {
    const byteArray = Buffer.from(response, 'hex');

    // Extract parts
    const action = byteArray.readUInt32BE(0);
    const respTransactionId = response.toString('hex',4,8);// This uses Buffer.toString('encoding',start,end) method
    const connectionIdHigh = byteArray.readUInt32BE(8);
    const connectionIdLow = byteArray.readUInt32BE(12);
    
    // Combine the high and low parts to form the 64-bit connection ID
    const responseConnectionId = (BigInt(connectionIdHigh) << 32n) | BigInt(connectionIdLow);
    
    if(PendingConnectionsRequests[respTransactionId]){
        const tracker = PendingConnectionsRequests[respTransactionId]
        tracker.connectionID = responseConnectionId
        console.log(`Recieved ConenctionID for ${tracker.hostname}: ${responseConnectionId}`)
        ConnectedTrackersList.addTracker(tracker.hostname,{'connectionid':responseConnectionId,'transcationid':respTransactionId,'port':tracker.port})
        delete PendingConnectionsRequests[respTransactionId]
    }

    console.log("Connected Tracker list",ConnectedTrackersList.getTracker())
});
};
torrentInfo().then(data => {
    
    const announceUrls = data.announceUrls
    for(const tracker of announceUrls){
        try{
            console.log("tracker is",tracker)
            let url = new URL(tracker)
            let port = url.port || 6881

            
            sendConnectionRequest(url,port)

            ConnectedTrackersList.on('trackerAdded',(key,value) => {
                console.log(`New Tracker has been added to the list ${key}`)
                console.log(`New tracker post number is ${value.port}`)
            })
        
            
        }
        catch(err){
            console.error(`error connecting to tracker ${tracker}`,err.message)
        }
    }
    
}).finally(() => {
    console.log("closing Finally")
    // socket.close()
})




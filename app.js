import fs from 'fs/promises';
import bencode from 'bencode';
import { type } from 'os';
import crypto from 'crypto';
import net from 'net';
import { URLSearchParams, URL } from 'url';
import axios from 'axios';
import dgram from 'dgram'
import EventEmitter from 'events';
const createAnnounceRequest = (connectionID, transactionID, infoHash, peerIdBuffer, left) => {
    if (!connectionID) {
        throw new Error('Missing required parameter: connectionID');
    }
    if (!transactionID) {
        throw new Error('Missing required parameter: transactionID');
    }
    if (!infoHash) {
        throw new Error('Missing required parameter: infoHash');
    }
    if (!peerIdBuffer) {
        throw new Error('Missing required parameter: peerIdBuffer');
    }
    if (left === undefined) {
        throw new Error('Missing required parameter: left');
    }
    const connectionIDBuffer = Buffer.alloc(8);
    connectionIDBuffer.writeBigUInt64BE(BigInt(connectionID), 0);
    const actionBuffer = Buffer.alloc(4);
    actionBuffer.writeUInt32BE(1, 0);
    const transactionIDBuffer = Buffer.from(transactionID, 'hex'); 
    const infoHashBuffer = Buffer.from(infoHash, 'hex'); 
    if (peerIdBuffer.length !== 20) {
        throw new Error('Invalid peer ID length');
    }
    const downloadedBuffer = Buffer.alloc(8);
    downloadedBuffer.writeBigUInt64BE(BigInt(0), 0);
    const leftBuffer = Buffer.alloc(8);
    leftBuffer.writeBigUInt64BE(BigInt(left), 0);
    const uploadedBuffer = Buffer.alloc(8);
    uploadedBuffer.writeBigUInt64BE(BigInt(0), 0);
    const eventBuffer = Buffer.alloc(4);
    eventBuffer.writeUInt32BE(0, 0);
    const ipBuffer = Buffer.alloc(4);
    ipBuffer.writeUInt32BE(0, 0);
    const keyBuffer = crypto.randomBytes(4); 
    const numWantBuffer = Buffer.alloc(4);
    numWantBuffer.writeInt32BE(-1, 0);
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeUInt16BE(1337, 0); 
    const requestBuffer = Buffer.concat([
        connectionIDBuffer,
        actionBuffer,
        transactionIDBuffer,
        infoHashBuffer,
        peerIdBuffer,
        downloadedBuffer,
        leftBuffer,
        uploadedBuffer,
        eventBuffer,
        ipBuffer,
        keyBuffer,
        numWantBuffer,
        portBuffer
    ]);
    return requestBuffer;
};
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
    let data = await fs.readFile('torrent_file.torrent')
    let jsonData = bencode.decode(data)
    let parsedTorrent = convertUint8ArrayToString(jsonData)
    return parsedTorrent
}
const peerId = () => {
    const clientPrefix = Buffer.from('-FC1000-', 'utf-8'); 
    const randomBytes = crypto.randomBytes(12); 
    return Buffer.concat([clientPrefix, randomBytes]); 
}

const total_length = (info) => {

    if("length" in info){
        return info['length']
    }
    else if("files" in info){
        let total_length = 0
        for(let i of info['files']){
            
            total_length += i['length']
        }
        return total_length
    }
    else{
        throw new Error("Invalid torrent file structure")
    }
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
    let left_size = total_length(infoDict)
    let response = {
        'annouceUrl': announceURL,
        'info_hash': infoHashURLEncoded,
        'peer_id': pId,
        'port': port,
        'uploaded': 0,
        'downloaded': 0,
        'left': left_size,
        'event': 'started',
        'announceUrls': annouceUrls,
        'infoDict':infoDict
    }
    return response
}
const createConnectionRequest = (transactionID) => {
    const connectionID = Buffer.from('0000041727101980', 'hex')
    const action = Buffer.alloc(4)  
    action.writeUInt32BE(0, 0)  
    return Buffer.concat([connectionID, action, transactionID])
}
const PendingConnectionsRequests = {}
class TrackerData extends EventEmitter {
    constructor() {
        super()
        this.tracker = new Proxy({}, this.createHandler())
        this.createHandler = this.createHandler.bind(this)
    }
    createHandler() {
        return {
            set: (target, key, value) => {
                let isTargetExists = !target.hasOwnProperty(key)
                if (isTargetExists) {
                    target[key] = value
                    this.emit('trackerAdded', key, value)
                }
                return true
            }
        }
    }
    addTracker(key, value) {
        this.tracker[key] = value
    }
    getTracker() {
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
            if (err.code === 'ENOTFOUND') {
                setTimeout(() => sendConnectionRequest(trackerURL, port, retryCount + 1), 1000);
            } else {
                console.error("Sending error:", err);
            }
        } else {
            PendingConnectionsRequests[transactionID.toString('hex')] = trackerURL
        }
    });
};
socket.on('message', (response, rinfo) => {
    
    const byteArray = Buffer.from(response, 'hex');
    const action = byteArray.readUInt32BE(0);
    if (action === 0) {
        const respTransactionId = response.toString('hex', 4, 8);
        const connectionIdHigh = byteArray.readUInt32BE(8);
        const connectionIdLow = byteArray.readUInt32BE(12);
        const responseConnectionId = (BigInt(connectionIdHigh) << 32n) | BigInt(connectionIdLow);
        if (PendingConnectionsRequests[respTransactionId]) {
            const tracker = PendingConnectionsRequests[respTransactionId];
            tracker.connectionID = responseConnectionId;
            ConnectedTrackersList.addTracker(tracker.hostname, {
                'connectionid': responseConnectionId,
                'transcationid': respTransactionId,
                'port': tracker.port
            });
            delete PendingConnectionsRequests[respTransactionId];
        }
    } 
    else if (action === 1) {
        const interval = response.readUInt32BE(8);
        const leechers = response.readUInt32BE(12);
        const seeders = response.readUInt32BE(16);
        const peers = [];
        for (let i = 20; i < response.length; i += 6) {
            const ip = `${response[i]}.${response[i + 1]}.${response[i + 2]}.${response[i + 3]}`;
            const port = response.readUInt16BE(i + 4);
            peers.push({ ip, port });
        }
    }
});
socket.on('error', (err) => {
    console.error('Socket error:', err);
    socket.close(); 
});
socket.on('close', () => {
    console.log('Socket closed');
});
const createPeerListConnection = (trackerList, infoHash, peerID, left) => {
    for (const [trackerUrl, data] of Object.entries(trackerList)) {
        const port = parseInt(data.port, 10) || 6881;
        const connectionId = data.connectionid;
        const transactionID = Buffer.from(data.transcationid, 'hex');
        const hostname = trackerUrl.split(':')[0];
        const trackerPort = port;
        const fullUrl = `http://${hostname}:${trackerPort}`;
        const announceRequest = createAnnounceRequest(connectionId, transactionID, infoHash, peerID, left);
        try {
            socket.send(announceRequest, 0, announceRequest.length, trackerPort, hostname, (err) => {
                if (err) {
                    console.error(`Couldn't send request to tracker ${fullUrl}:`, err.message);
                }
                console.log('Sent a request to: ',hostname)
            });
        } catch (err) {
            console.error('Error sending request:', err.message);
        }
    }
};
torrentInfo().then(data => {
    const announceUrls = data.announceUrls;
    for (const tracker of announceUrls) {
        try {
            const url = new URL(tracker);
            const port = url.port || 6881;
            sendConnectionRequest(url, port);
        } catch (err) {
            console.error(`Error connecting to tracker ${tracker}:`, err.message);
        }
    }
    ConnectedTrackersList.on('trackerAdded', (key, value) => {
                const trackerList = ConnectedTrackersList.getTracker();
                createPeerListConnection(trackerList, data.info_hash, data.peer_id, data.left);
            });
}).finally(() => {
    console.log("Closing finally.");
});

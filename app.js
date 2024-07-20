    import fs from 'fs/promises';
    import bencode from 'bencode';
    import { type } from 'os';
    import crypto from 'crypto';
    import net from 'net';
    import { URLSearchParams,URL } from 'url';
    import axios from 'axios';

    import dgram from 'dgram'


    import EventEmitter from 'events';

    
    
    const createAnnounceRequest = (connectionID, transactionID, infoHash, peerIdBuffer, left) => {
        if (!connectionID || !transactionID || !infoHash || !peerIdBuffer || left === undefined) {
            throw new Error('Missing required parameters');
        }
    
        // Construction of buffers
        const connectionIDBuffer = Buffer.alloc(8);
        connectionIDBuffer.writeBigUInt64BE(BigInt(connectionID), 0);
    
        const actionBuffer = Buffer.alloc(4);
        actionBuffer.writeUInt32BE(1, 0);
    
        const transactionIDBuffer = Buffer.from(transactionID, 'hex'); // 4 bytes
    
        const infoHashBuffer = Buffer.from(infoHash, 'hex'); // 20 bytes
    
        // Ensure peerIdBuffer is 20 bytes
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
    
        const keyBuffer = crypto.randomBytes(4); // 4 bytes
    
        const numWantBuffer = Buffer.alloc(4);
        numWantBuffer.writeInt32BE(-1, 0);
    
        const portBuffer = Buffer.alloc(2);
        portBuffer.writeUInt16BE(1337, 0); // 2 bytes
    
        // Concatenate all buffers
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
    
        console.log(`Request Buffer Length: ${requestBuffer.length}`); // Should be 98
        console.log(`Request Buffer Content: ${requestBuffer.toString('hex')}`);
            
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
        let data = await fs.readFile('first_file.torrent')
        let jsonData = bencode.decode(data)
        let parsedTorrent = convertUint8ArrayToString(jsonData)

        return parsedTorrent

    }

    const peerId = () => {
        const clientPrefix = Buffer.from('-FC1000-', 'utf-8'); // 8 bytes
        const randomBytes = crypto.randomBytes(12); // 12 bytes
        return Buffer.concat([clientPrefix, randomBytes]); // 20 bytes in total
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

            if(retryCount > 15){
                console.log("More than 15 retriessssssssssssss")
                socket.close()
            }
        });
        

    

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

        // console.log("Connected Tracker list",ConnectedTrackersList.getTracker())
    });
    };

    const dummy_tracker_data = {
        'tracker.internetwarriors.net': {
          connectionid: 12166777240692464727n,
          transcationid: 'bf19bfbb',
          port: '1337'
        },
        'tracker.opentrackr.org': {
          connectionid: 17977800229363310647n,
          transcationid: '3148651c',
          port: '1337'
        },
        'glotorrents.pw': {
          connectionid: 7391781883746451452n,
          transcationid: '24f63849',
          port: '6969'
        },
        'tracker.torrent.eu.org': {
          connectionid: 17936456095237353297n,
          transcationid: '75b74be3',
          port: '451'
        },
        'tracker.vanitycore.co': {
          connectionid: 7391781884918838758n,
          transcationid: 'fbda6e13',
          port: '6969'
        },
        'open.stealth.si': {
          connectionid: 11316125973778116976n,
          transcationid: '372f79f9',
          port: '80'
        },
        'tracker.tiny-vps.com': {
          connectionid: 13325772358578447761n,
          transcationid: '6870233f',
          port: '6969'
        }
      }
    
// Function to handle peer list connection
const createPeerListConnection = (trackerList, infoHash, peerID, left) => {
    for (const [trackerUrl, data] of Object.entries(trackerList)) {
        console.log('Tracker URL:', trackerUrl);
        console.log('Tracker Data:', data);

        const port = parseInt(data.port, 10) || 6881;
        const connectionId = data.connectionid;
        const transactionID = Buffer.from(data.transcationid, 'hex');
        const hostname = trackerUrl.split(':')[0];
        const trackerPort = port;

        // Construct a valid URL
        const fullUrl = `http://${hostname}:${trackerPort}`;

        console.log('Full URL:', fullUrl);
        console.log('Input Parameters:', connectionId, transactionID, infoHash, peerID, left);

        const announceRequest = createAnnounceRequest(connectionId, transactionID, infoHash, peerID, left);

        console.log("Announce Request Length:", announceRequest.length);

        try {
            socket.send(announceRequest, 0, announceRequest.length, trackerPort, hostname, (err) => {
                if (err) {
                    console.error(`Couldn't send request to tracker ${fullUrl}:`, err.message);
                } else {
                    console.log("Sent the request to tracker URL regarding the peer.");
                }
            });
        } catch (err) {
            console.error('Error sending request:', err.message);
        }
    }
};

// Example usage
torrentInfo().then(data => {
    const announceUrls = data.announceUrls;

    for (const tracker of announceUrls) {
        try {
            // Ensure tracker URL includes the protocol and port if necessary
            let url;
            if (!tracker.startsWith('http://') && !tracker.startsWith('https://')) {
                url = new URL(`http://${tracker}`);
            } else {
                url = new URL(tracker);
            }
            const port = url.port || 6881;

            sendConnectionRequest(url, port);

            ConnectedTrackersList.on('trackerAdded', (key, value) => {
                console.log('Added Tracker:', ConnectedTrackersList);
                const trackerList = ConnectedTrackersList.getTracker();
                createPeerListConnection(trackerList, data.info_hash, data.peer_id, data.left);
            });
        } catch (err) {
            console.error(`Error connecting to tracker ${tracker}:`, err.message);
        }
    }
}).finally(() => {
    console.log("Closing finally.");
    // socket.close();
});


socket.setMaxListeners(20); // Adjust the number as needed
ConnectedTrackersList.setMaxListeners(20); // Adjust for the ConnectedTrackersList


// Example usage
torrentInfo().then(data => {
    const announceUrls = data.announceUrls;

    for (const tracker of announceUrls) {
        try {
            // Parse the tracker URL
            const url = new URL(tracker);
            const port = url.port || 6881;

            sendConnectionRequest(url, port);

            ConnectedTrackersList.on('trackerAdded', (key, value) => {
                console.log('Added Tracker:', ConnectedTrackersList);
                const trackerList = ConnectedTrackersList.getTracker();
                createPeerListConnection(trackerList, data.info_hash, data.peer_id, data.left);
            });
        } catch (err) {
            console.error(`Error connecting to tracker ${tracker}:`, err.message);
        }
    }
}).finally(() => {
    console.log("Closing finally.");
    // socket.close();
});
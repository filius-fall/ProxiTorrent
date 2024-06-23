import fs from 'fs/promises';
import bencode from 'bencode';
import { type } from 'os';
import crypto from 'crypto';
import net from 'net';

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



const port = 6881 // standard BitTorrent Port
const server = net.createServer(async (socket) => {
    
    try {
        const parsedTorrent = await ProccessedTorrentFile()
        const infoDict = parsedTorrent.info
        const bencodedData = bencode.encode(infoDict)
        const infoHash = crypto.createHash('sha1').update(bencodedData).digest('hex')
        const infoHashURLEncoded = encodeURIComponent(infoHash.toString('binary'))
        let pId = peerId()
    
    } catch (err) {
        console.error('Error processing torrent file:', err)
    }
})

server.listen(port, () => {
    console.log('Server started')
})

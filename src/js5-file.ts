import { ByteBuffer } from '@runejs/core/buffer';
import { Compression } from '@runejs/core/compression';
import { Js5Store } from './js5-store';
import { Js5Archive } from './js5-archive';
import { StoreFileBase } from './store-file-base';


export class Js5File extends StoreFileBase {

    public readonly store: Js5Store;
    public readonly archive: Js5Archive;

    protected _sector: number;

    public constructor(index: string | number, store: Js5Store);
    public constructor(index: string | number, archive: Js5Archive);
    public constructor(index: string | number, store: Js5Store, archive: Js5Archive);
    public constructor(index: string | number, arg1: Js5Store | Js5Archive, arg2?: Js5Archive) {
        super(index);

        let store: Js5Store;
        let archive: Js5Archive;
        if(arg1 instanceof Js5Archive) {
            archive = arg1;
            store = arg1.store;
        } else {
            store = arg1;
            archive = arg2;
        }

        this.store = store;
        this.archive = archive;
        this._name = this.index;
        this.setData(null, true);
    }

    public decompress(): ByteBuffer | null {
        const encryption = !this.store.xteaDisabled ? (this.archive?.details?.content?.encryption ?? 'none') : 'none';
        return super.decompress(encryption);
    }

    public extractPackedFile(indexChannel: ByteBuffer, dataChannel: ByteBuffer): ByteBuffer {
        const indexDataLength = 6;

        let pointer = this.numericIndex * indexDataLength;
        if(pointer < 0 || pointer >= indexChannel.length) {
            throw new Error('File Not Found');
        }

        const fileIndexData = new ByteBuffer(indexDataLength);
        indexChannel.copy(fileIndexData, 0, pointer, pointer + indexDataLength);

        if(fileIndexData.readable !== indexDataLength) {
            throw new Error(`Not Enough Readable Index Data: Buffer contains ${fileIndexData.readable} but needed ${indexDataLength}`);
        }

        this.size = fileIndexData.get('int24', 'unsigned');
        this.sector = fileIndexData.get('int24', 'unsigned');

        const data = new ByteBuffer(this.size);
        const sectorDataLength = 512;
        const fullSectorLength = 520;

        let chunk = 0, remaining = this.size;
        pointer = this.sector * fullSectorLength;

        do {
            const temp = new ByteBuffer(fullSectorLength);
            dataChannel.copy(temp, 0, pointer, pointer + fullSectorLength);

            if(temp.readable !== fullSectorLength) {
                throw new Error(`Not Enough Readable Sector Data: Buffer contains ${temp.readable} but needed ${fullSectorLength}`);
            }

            const sectorId = temp.get('short', 'unsigned');
            const sectorChunk = temp.get('short', 'unsigned');
            const nextSector = temp.get('int24', 'unsigned');
            const sectorIndex = temp.get('byte', 'unsigned');
            const sectorData = new ByteBuffer(sectorDataLength);
            temp.copy(sectorData, 0, temp.readerIndex, temp.readerIndex + sectorDataLength);

            if(remaining > sectorDataLength) {
                sectorData.copy(data, data.writerIndex, 0, sectorDataLength);
                data.writerIndex = (data.writerIndex + sectorDataLength);
                remaining -= sectorDataLength;

                if(sectorIndex !== this.archive.numericIndex) {
                    throw new Error('File type mismatch.');
                }

                if(sectorId !== this.numericIndex) {
                    throw new Error('File id mismatch.');
                }

                if(sectorChunk !== chunk++) {
                    throw new Error('Chunk mismatch.');
                }

                pointer = nextSector * fullSectorLength;
            } else {
                sectorData.copy(data, data.writerIndex, 0, remaining);
                data.writerIndex = (data.writerIndex + remaining);
                remaining = 0;
            }
        } while(remaining > 0);

        this.setData(data, true);
        return this._data;
    }

    public get compression(): Compression {
        return this._compression ?? this.archive?.compression ?? Compression.uncompressed;
    }

    public set compression(compression: Compression) {
        this._compression = compression;
    }

    public get sector(): number {
        return this._sector;
    }

    public set sector(value: number) {
        this._sector = value;
    }
}
